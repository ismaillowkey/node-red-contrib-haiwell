/**
 Copyright (c) since the year 2016 Klaus Landsdorf (http://plus4nodered.com/)
 Copyright 2016 - Jason D. Harper, Argonne National Laboratory
 Copyright 2015,2016 - Mika Karaila, Valmet Automation Inc.
 All rights reserved.
 node-red-contrib-modbus

 @author <a href="mailto:klaus.landsdorf@bianco-royal.de">Klaus Landsdorf</a> (Bianco Royal)
 **/

module.exports = function (RED) {
  'use strict'
  // SOURCE-MAP-REQUIRED
  const mbBasics = require('./modbus-basics')
  const mbCore = require('./core/modbus-core')
  const internalDebugLog = require('debug')('contribHaiwell:write-single-word')

  function HaiwellWriteSingleWord (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name
    this.showStatusActivities = config.showStatusActivities
    this.showErrors = config.showErrors
    this.showWarnings = config.showWarnings

    this.unitid = config.unitid
    this.dataType = config.dataType

    this.haiwellComponent = config.haiwellComponent || 'V'
    let offset = 0
    switch (this.haiwellComponent) {
      case 'CR': offset = 0; break
      case 'AQ': offset = 256; break
      case 'V': offset = 512; break
      case 'TV': offset = 15360; break
      case 'CV': offset = 16384; break
      case 'SV': offset = 17408; break
    }

    this.adr = (parseInt(config.adr) || 0) + offset
    this.endianness = config.endianness || 'CDAB'
    this.targetType = config.targetType || 'int16'

    this.emptyMsgOnFail = config.emptyMsgOnFail
    this.keepMsgProperties = config.keepMsgProperties
    this.internalDebugLog = internalDebugLog
    this.verboseLogging = RED.settings.verbose

    this.delayOnStart = config.delayOnStart
    this.startDelayTime = parseInt(config.startDelayTime) || 10

    const node = this
    node.bufferMessageList = new Map()
    node.INPUT_TIMEOUT_MILLISECONDS = 1000
    node.delayOccured = false
    node.inputDelayTimer = null

    mbBasics.setNodeStatusTo('waiting', node)

    const modbusClient = RED.nodes.getNode(config.server)
    if (!modbusClient) {
      return
    }
    modbusClient.registerForModbus(node)
    mbBasics.initModbusClientEvents(node, modbusClient)

    node.onModbusWriteDone = function (resp, msg) {
      if (node.showStatusActivities) {
        mbBasics.setNodeStatusTo('write done', node)
      }

      node.send(mbCore.buildMessage(node.bufferMessageList, msg.payload, resp, msg))
      node.emit('modbusWriteNodeDone')
    }

    node.errorProtocolMsg = function (err, msg) {
      if (node.showErrors) {
        mbBasics.logMsgError(node, err, msg)
      }
    }

    node.onModbusWriteError = function (err, msg) {
      node.internalDebugLog(err.message)
      const origMsg = mbCore.getOriginalMessage(node.bufferMessageList, msg)
      node.errorProtocolMsg(err, origMsg)
      mbBasics.sendEmptyMsgOnFail(node, err, msg)
      mbBasics.setModbusError(node, modbusClient, err, origMsg)
      node.emit('modbusWriteNodeError')
    }

    node.buildNewMessageObject = function (node, msg, values, quantity) {
      const messageId = mbCore.getObjectId()
      return {
        topic: msg.topic || node.id,
        messageId,
        payload: {
          value: values,
          unitid: node.unitid,
          fc: mbCore.functionCodeModbusWrite(node.dataType),
          address: node.adr,
          quantity,
          messageId
        }
      }
    }

    function verboseWarn (logMessage) {
      if (RED.settings.verbose && node.showWarnings) {
        node.warn('Writer -> ' + logMessage)
      }
    }

    node.isReadyForInput = function () {
      return (modbusClient.client && modbusClient.isActive() && node.delayOccured)
    }

    node.isNotReadyForInput = function () {
      return !node.isReadyForInput()
    }

    node.resetInputDelayTimer = function () {
      if (node.inputDelayTimer) {
        verboseWarn('reset input delay timer node ' + node.id)
        clearTimeout(node.inputDelayTimer)
      }
      node.inputDelayTimer = null
      node.delayOccured = false
    }

    node.initializeInputDelayTimer = function () {
      node.resetInputDelayTimer()
      if (node.delayOnStart) {
        verboseWarn('initialize input delay timer node ' + node.id)
        node.inputDelayTimer = setTimeout(() => {
          node.delayOccured = true
        }, node.INPUT_TIMEOUT_MILLISECONDS * node.startDelayTime)
      } else {
        node.delayOccured = true
      }
    }

    node.initializeInputDelayTimer()

    node.on('input', function (msg) {
      if (node.isNotReadyForInput()) {
        verboseWarn('Inject while node is not ready for input.')
        return
      }

      if (modbusClient.isInactive()) {
        verboseWarn('You sent an input to inactive client. Please use initial delay on start or send data more slowly.')
        return false
      }

      const origMsgInput = Object.assign({}, msg)
      try {
        let value = msg.payload
        if (typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'string') {
          throw new Error('Input msg.payload must be a number/string representing a number')
        }

        // Parse the value according to the type
        if (node.targetType === 'int64' || node.targetType === 'uint64') {
          value = BigInt(value)
        } else {
          value = Number(value)
          if (isNaN(value)) throw new Error('Invalid number input')
        }

        // Determine how many registers we need
        let requiredRegisters = 1
        switch (node.targetType) {
          case 'int16':
          case 'uint16':
            requiredRegisters = 1
            break
          case 'int32':
          case 'uint32':
          case 'float32':
            requiredRegisters = 2
            break
          case 'int64':
          case 'uint64':
          case 'double64':
            requiredRegisters = 4
            break
        }

        // Allocate a buffer and write the numeric value into it
        const buf = Buffer.alloc(requiredRegisters * 2)

        switch (node.targetType) {
          case 'int16': buf.writeInt16BE(value, 0); break
          case 'uint16': buf.writeUInt16BE(value, 0); break
          case 'int32': buf.writeInt32BE(value, 0); break
          case 'uint32': buf.writeUInt32BE(value, 0); break
          case 'float32': buf.writeFloatBE(value, 0); break
          case 'double64': buf.writeDoubleBE(value, 0); break
          case 'int64': buf.writeBigInt64BE(value, 0); break
          case 'uint64': buf.writeBigUInt64BE(value, 0); break
        }

        // Split the buffer into an array of 16-bit words based on Endianness
        const outArray = []
        if (requiredRegisters === 1) {
          outArray.push(buf.readUInt16BE(0))
        } else if (requiredRegisters === 2) {
          if (node.endianness === 'ABCD') {
            outArray.push(buf.readUInt16BE(0))
            outArray.push(buf.readUInt16BE(2))
          } else if (node.endianness === 'CDAB') {
            outArray.push(buf.readUInt16BE(2))
            outArray.push(buf.readUInt16BE(0))
          }
        } else if (requiredRegisters === 4) {
          if (node.endianness === 'ABCD') {
            outArray.push(buf.readUInt16BE(0))
            outArray.push(buf.readUInt16BE(2))
            outArray.push(buf.readUInt16BE(4))
            outArray.push(buf.readUInt16BE(6))
          } else if (node.endianness === 'CDAB') {
            outArray.push(buf.readUInt16BE(2))
            outArray.push(buf.readUInt16BE(0))
            outArray.push(buf.readUInt16BE(6))
            outArray.push(buf.readUInt16BE(4))
          }
        }

        // Output value is the array
        const newMsg = node.buildNewMessageObject(node, origMsgInput, outArray, requiredRegisters)
        node.bufferMessageList.set(newMsg.messageId, mbBasics.buildNewMessage(node.keepMsgProperties, origMsgInput, newMsg))
        modbusClient.emit('writeModbus', newMsg, node.onModbusWriteDone, node.onModbusWriteError)

        if (node.showStatusActivities) {
          mbBasics.setNodeStatusTo(modbusClient.actualServiceState, node)
        }
      } catch (err) {
        node.errorProtocolMsg(err, origMsgInput)
        mbBasics.sendEmptyMsgOnFail(node, err, origMsgInput)
      }
    })

    node.on('close', function (done) {
      mbBasics.setNodeStatusTo('closed', node)
      node.bufferMessageList.clear()
      modbusClient.deregisterForModbus(node.id, done)
    })

    if (!node.showStatusActivities) {
      mbBasics.setNodeDefaultStatus(node)
    }
  }

  RED.nodes.registerType('haiwell-write-single-word', HaiwellWriteSingleWord)
}
