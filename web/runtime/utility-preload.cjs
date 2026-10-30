'use strict'
// Electron utility processes talk through process.parentPort; Node children use process.send.
const { EventEmitter } = require('node:events')
const port = new EventEmitter()
port.postMessage = (message) => {
  if (process.connected) process.send(message)
}
process.on('message', (data) => port.emit('message', { data, ports: [] }))
process.parentPort = port

