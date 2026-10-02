// 엔진 CLI·스크립트를 Electron 내장 node(ELECTRON_RUN_AS_NODE)로 실행하고 실패 사유를 해석
const { spawn } = require('node:child_process');
const path = require('node:path');

const REASONS = {
  ENCRYPTED: '열기 암호가 걸린 문서입니다',
  DRM_PROTECTED: '한컴 문서보안(DRM) 문서라 열 수 없습니다',
  UNSUPPORTED_FORMAT: '지원하지 않는 형식입니다',
  CORRUPTED: '파일이 손상되었습니다',
  IMAGE_BASED_PDF: '글자층이 없는 스캔 PDF입니다',
  ZIP_BOMB: '압축 해제 크기 제한을 넘었습니다',
  DECOMPRESSION_BOMB: '압축 해제 크기 제한을 넘었습니다',
  NO_SECTIONS: '본문이 없는 문서입니다',
  OUTPUT_TOO_LARGE: '변환 결과가 너무 큽니다',
  MISSING_DEPENDENCY: '엔진 구성 요소가 빠져 있습니다',
  EMPTY_INPUT: '빈 파일입니다',
  FILE_NOT_FOUND: '파일을 찾을 수 없습니다',
  PARSE_ERROR: '문서 해석에 실패했습니다',
};

const shim = path.join(__dirname, 'node-shim.cjs').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// script를 node로 실행 → {code, stdout, stderr}. signal로 취소하면 code는 null
function run(script, args, { signal, cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [shim, script, ...args], {
      cwd,
      signal,
      windowsHide: true,
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ code: err.name === 'AbortError' ? null : -1, stdout, stderr: stderr + err.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// 실패 JSON의 code를 우선 해석하고, 없으면 stderr 마지막 줄을 쓴다
function failure(stdout, stderr) {
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{') || !line.includes('"success":false')) continue;
    try {
      const j = JSON.parse(line);
      return REASONS[j.code] || j.error || j.code;
    } catch {}
  }
  const last = stderr.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return last ? last.replace(/^\[kordoc\]\s*/, '') : '알 수 없는 오류';
}

// 실패 JSON의 code만 뽑는다(재시도 판단용)
const failureCode = (stdout) => (stdout.match(/"code":"([A-Z_]+)"/) || [])[1];

module.exports = { run, failure, failureCode };
