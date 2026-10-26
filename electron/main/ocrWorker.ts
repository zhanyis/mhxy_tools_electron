import { parentPort, workerData } from 'node:worker_threads'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createWorker, OEM, PSM } from 'tesseract.js'

const port = parentPort!
const require = createRequire(import.meta.url)
const reportError = (error: unknown) => port.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })

async function initialize() {
  await mkdir(workerData.cachePath, { recursive: true })
  // Node workers cannot execute scripts inside ASAR; core/WASM files are unpacked too.
  const workerPath = require.resolve('tesseract.js/src/worker-script/node/index.js')
    .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  const worker = await createWorker('chi_sim+eng', OEM.LSTM_ONLY, {
    cachePath: workerData.cachePath,
    workerPath,
    errorHandler: reportError,
  })
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
  port.on('message', async (image: Uint8Array) => {
    try {
      const { data } = await worker.recognize(Buffer.from(image))
      port.postMessage({ type: 'result', data: { text: data.text, confidence: data.confidence } })
    } catch (error) { reportError(error) }
  })
  port.postMessage({ type: 'ready' })
}
void initialize().catch(reportError)