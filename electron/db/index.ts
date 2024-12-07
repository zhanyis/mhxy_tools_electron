import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { app } from 'electron'
import { JSONFilePreset } from 'lowdb/node' // Replace with actual module
import defaultDb from './db';

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

class Database {
  defaultData: any;
  userDataPath: string;
  dbPath: string;
  db: any;

  constructor() {
    this.defaultData = defaultDb;
    this.userDataPath = app.getPath('userData')
    this.dbPath = path.join(this.userDataPath, 'db.json')
    console.log(this.dbPath)
  }

  async init() {
    this.db = await JSONFilePreset(this.dbPath, this.defaultData)
    console.log(`DB initialized`, this.db)
  }

  getDb() {
    return this.db
  }

  async create(field, item) {
    await this.db.update((data) => {
      if (!data[field]) {
        data[field] = []
      }
      data[field].push(item)
    })
    await this.db.read()
    console.log(`Item created in ${field}`, item)
  }

  async read(field) {
    await this.db.read()
    console.log("Data read", this.db)
    if (field) {
      return this.db.data[field]
    }
    return this.db.data
  }

  async update(field, callback = (d) => (d)) {
    await this.db.update((data) => {
      callback(data[field])
    })
    await this.db.read()
    console.log("Data updated", this.db)
  }

  async delete(field, key, value) {
    await this.db.update((data) => {
      data[field] = data[field].filter((item) => item[key] !== value)
      return data
    })
    await this.db.read()
    console.log(`Item deleted in ${field} at key ${key} value ${value}`)
  }
}

export default Database
