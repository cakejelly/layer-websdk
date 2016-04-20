/**
 * Layer Constants are stored in two places:
 *
 * 1. As part of the layer.Constants singleton
 * 2. As static properties on classes.
 *
 * Typically the static property constants are designed to be changed by developers to customize behaviors,
 * and tend to only be used by that single class.
 *
 * @class layer.Constants
 * @singleton
 */
module.exports = {
  /**
   * Is the object synchronized with the server?
   * @property {Object} [SYNC_STATE=null]
   * @property {string} SYNC_STATE.NEW      - Object is newly created, was created locally, not from server data, and has not yet been sent to the server.
   * @property {string} SYNC_STATE.SAVING   - Object is newly created and is being sent to the server.
   * @property {string} SYNC_STATE.SYNCING  - Object exists both locally and on server but is being synced with changes.
   * @property {string} SYNC_STATE.SYNCED   - Object exists both locally and on server and at last check was in sync.
   * @property {string} SYNC_STATE.LOADING  - Object is being loaded from the server and may not have its properties set yet.
   */
  SYNC_STATE: {
    NEW: 'NEW',
    SAVING: 'SAVING',
    SYNCING: 'SYNCING',
    SYNCED: 'SYNCED',
    LOADING: 'LOADING',
  },

  /**
   * Values for readStatus/deliveryStatus
   * @property {Object} [RECIPIENT_STATE=]
   * @property {string} RECIPIENT_STATE.NONE - No users have read (or received) this Message
   * @property {string} RECIPIENT_STATE.SOME - Some users have read (or received) this Message
   * @property {string} RECIPIENT_STATE.ALL  - All users have read (or received) this Message
   */
  RECIPIENT_STATE: {
    NONE: 'NONE',
    SOME: 'SOME',
    ALL: 'ALL',
  },

  /**
   * Values for recipientStatus
   * @property {Object} [RECEIPT_STATE=]
   * @property {string} RECEIPT_STATE.SENT      - The Message has been sent to the specified user but it has not yet been received by their device.
   * @property {string} RECEIPT_STATE.DELIVERED - The Message has been delivered to the specified use but has not yet been read.
   * @property {string} RECEIPT_STATE.READ      - The Message has been read by the specified user.
   * @property {string} RECEIPT_STATE.PENDING   - The request to send this Message to the specified user has not yet been received by the server.
   */
  RECEIPT_STATE: {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    PENDING: 'pending',
  },
  LOCALSTORAGE_KEYS: {
    SESSIONDATA: 'layer-session-data-',
  },
  ACCEPT: 'application/vnd.layer+json; version=1.0',

  /**
   * Log levels
   * @property {Object} [LOG=]
   * @property {number} LOG.DEBUG     Log detailed information about requests, responses, events, state changes, etc...
   * @property {number} LOG.INFO      Log sparse information about requests, responses and events
   * @property {number} LOG.WARN      Log failures that are expected, normal, handled, but suggests that an operation didn't complete as intended
   * @property {number} LOG.ERROR     Log failures that are not expected or could not be handled
   * @property {number} LOG.NONE      Logs? Who needs em?
   */
  LOG: {
    DEBUG: 4,
    INFO: 3,
    WARN: 2,
    ERROR: 1,
    NONE: 0,
  },

  /**
   * Deletion Modes
   * @property {Object} [DELETION_MODE=]
   * @property {number} DELETION_MODE.ALL          Delete Message/Conversation for All users but remain in the Conversation;
   *                                               new Messages will restore this Conversation minus any Message History prior to deletion.
   * @property {number} DELETION_MODE.MY_DEVICES   Delete Message or Conversation; but see layer.Conversation.leave if you want to delete
   *                                               a Conversation and not have it come back.
   */
  DELETION_MODE: {
    ALL: 1,
    MY_DEVICES: 2,
  },
};
