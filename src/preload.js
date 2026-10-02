// 렌더러에 메인 프로세스 기능과 드롭 파일 경로 조회를 노출
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (name) => (arg) => ipcRenderer.invoke(name, arg);

contextBridge.exposeInMainWorld('api', {
  pathOf: (file) => webUtils.getPathForFile(file),
  onProgress: (fn) => ipcRenderer.on('convert:progress', (_e, m) => fn(m)),
  ...Object.fromEntries(
    ['pick', 'stat', 'readText', 'writeText', 'reveal', 'convert', 'cancelConvert', 'skipFile', 'setSkipOcr', 'compare', 'formFields', 'fill', 'generate', 'help', 'engineInfo', 'engineLatest', 'engineUpdate', 'engineRollback', 'theme', 'setTheme'].map((n) => [n, call(n)]),
  ),
});
