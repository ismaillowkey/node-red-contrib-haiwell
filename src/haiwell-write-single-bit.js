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
  const internalDebugLog = require('debug')('contribHaiwell:write-single-bit')

  function HaiwellWriteSingleBit (config) {
    RED.nodes.createNode(this, config)

    this.name = config.name
    this.showStatusActivities = config.showStatusActivities
    this.showErrors = config.showErrors
    this.showWarnings = config.showWarnings

    this.unitid = config.unitid
    this.dataType = config.dataType

    this.haiwellComponent = config.haiwellComponent || 'M'
    let offset = 0
    switch (this.haiwellComponent) {
      case 'Y': offset = 1536; break
      case 'M': offset = 3072; break
      case 'T': offset = 15360; break
      case 'C': offset = 16384; break
      case 'SM': offset = 16896; break
      case 'S': offset = 28672; break
    }

    this.adr = (parseInt(config.adr) || 0) + offset

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

    node.buildNewMessageObject = function (node, msg, value) {
      const messageId = mbCore.getObjectId()
      return {
        topic: msg.topic || node.id,
        messageId,
        payload: {
          value,
          unitid: node.unitid,
          fc: 5,
          address: node.adr,
          quantity: 1,
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
        const value = msg.payload
        if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
          throw new Error('Input msg.payload must be a boolean or number')
        }

        let outValue = false
        if (typeof value === 'boolean') {
          outValue = value
        } else if (typeof value === 'number') {
          outValue = (value !== 0)
        } else if (typeof value === 'string') {
          const str = value.toLowerCase()
          outValue = (str === 'true' || str === '1')
        }

        // Output value is boolean for single bit write
        const newMsg = node.buildNewMessageObject(node, origMsgInput, outValue)
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

  RED.nodes.registerType('haiwell-write-single-bit', HaiwellWriteSingleBit)
}
