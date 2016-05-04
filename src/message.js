/**
 * The Message Class represents Messages sent amongst participants
 * of of a Conversation.
 *
 * The simplest way to create and send a message is:
 *
 *      var m = conversation.createMessage('Hello there').send();
 *
 * For conversations that involve notifications (primarily for Android and IOS), the more common pattern is:
 *
 *      var m = conversation.createMessage('Hello there').send({text: "Message from Fred: Hello there"});
 *
 * Typically, rendering would be done as follows:
 *
 *      // Create a layer.Query that loads Messages for the
 *      // specified Conversation.
 *      var query = client.createQuery({
 *        model: Query.Message,
 *        predicate: 'conversation = "' + conversation.id + '"'
 *      });
 *
 *      // Any time the Query's data changes the 'change'
 *      // event will fire.
 *      query.on('change', function(layerEvt) {
 *        renderNewMessages(query.data);
 *      });
 *
 *      // This will call will cause the above event handler to receive
 *      // a change event, and will update query.data.
 *      conversation.createMessage('Hello there').send();
 *
 * The above code will trigger the following events:
 *
 *  * Message Instance fires
 *    * messages:sending: An event that lets you modify the message prior to sending
 *    * messages:sent: The message was received by the server
 *  * Query Instance fires
 *    * change: The query has received a new Message
 *    * change:add: Same as the change event but more specific
 *
 * When creating a Message there are a number of ways to structure it.
 * All of these are valid and create the same exact Message:
 *
 *      // Full API style:
 *      var m = conversation.createMessage({
 *          parts: [new layer.MessagePart({
 *              body: 'Hello there',
 *              mimeType: 'text/plain'
 *          })]
 *      });
 *
 *      // Option 1: Pass in an Object instead of an array of layer.MessageParts
 *      var m = conversation.createMessage({
 *          parts: {
 *              body: 'Hello there',
 *              mimeType: 'text/plain'
 *          }
 *      });
 *
 *      // Option 2: Pass in an array of Objects instead of an array of layer.MessageParts
 *      var m = conversation.createMessage({
 *          parts: [{
 *              body: 'Hello there',
 *              mimeType: 'text/plain'
 *          }]
 *      });
 *
 *      // Option 3: Pass in a string (automatically assumes mimeType is text/plain)
 *      // instead of an array of objects.
 *      var m = conversation.createMessage({
 *          parts: 'Hello'
 *      });
 *
 *      // Option 4: Pass in an array of strings (automatically assumes mimeType is text/plain)
 *      var m = conversation.createMessage({
 *          parts: ['Hello']
 *      });
 *
 *      // Option 5: Pass in just a string and nothing else
 *      var m = conversation.createMessage('Hello');
 *
 *      // Option 6: Use addPart.
 *      var m = converseation.createMessage();
 *      m.addPart({body: "hello", mimeType: "text/plain"});
 *
 * Key methods, events and properties for getting started:
 *
 * Properties:
 *
 * * layer.Message.id: this property is worth being familiar with; it identifies the
 *   Message and can be used in `client.getMessage(id)` to retrieve it
 *   at any time.
 * * layer.Message.internalId: This property makes for a handy unique ID for use in dom nodes.
 *   It is gaurenteed not to change during this session.
 * * layer.Message.isRead: Indicates if the Message has been read yet; set `m.isRead = true`
 *   to tell the client and server that the message has been read.
 * * layer.Message.parts: An array of layer.MessagePart classes representing the contents of the Message.
 * * layer.Message.sentAt: Date the message was sent
 * * layer.Message.sender's `userId` property: Conversation participant who sent the Message. You may
 *   need to do a lookup on this id in your own servers to find a
 *   displayable name for it.
 *
 * Methods:
 *
 * * layer.Message.send(): Sends the message to the server and the other participants.
 * * layer.Message.on() and layer.Message.off(); event listeners built on top of the `backbone-events-standalone` npm project
 *
 * Events:
 *
 * * `messages:sent`: The message has been received by the server. Can also subscribe to
 *   this event from the layer.Client which is usually simpler.
 *
 * @class  layer.Message
 * @extends layer.Syncable
 */

const Root = require('./root');
const Syncable = require('./syncable');
const MessagePart = require('./message-part');
const LayerError = require('./layer-error');
const Constants = require('./const');
const Util = require('./client-utils');
const ClientRegistry = require('./client-registry');

class Message extends Syncable {
  /**
   * See layer.Conversation.createMessage()
   *
   * @method constructor
   * @return {layer.Message}
   */
  constructor(options = {}) {
    // Unless this is a server representation, this is a developer's shorthand;
    // fill in the missing properties around isRead/isUnread before initializing.
    if (!options.fromServer) {
      if ('isUnread' in options) {
        options.isRead = !options.isUnread && !options.is_unread;
      } else {
        options.isRead = true;
      }
    } else {
      options.id = options.fromServer.id;
    }

    if (options.client) options.clientId = options.client.appId;
    if (!options.clientId) throw new Error('clientId property required to create a Message');
    if (options.conversation) options.conversationId = options.conversation.id;

    // Insure __adjustParts is set AFTER clientId is set.
    const parts = options.parts;
    options.parts = null;

    super(options);
    this.parts = parts;

    const client = this.getClient();
    this.isInitializing = true;
    if (options && options.fromServer) {
      this._populateFromServer(options.fromServer);
    } else {
      this.sender = { userId: '', name: '' };
      this.sentAt = new Date();
    }

    if (!this.parts) this.parts = [];
    this.localCreatedAt = new Date();

    this._disableEvents = true;
    if (!options.fromServer) this.recipientStatus = {};
    else this.__updateRecipientStatus(this.recipientStatus);
    this._disableEvents = false;

    this.isInitializing = false;
    if (options && options.fromServer) {
      client._addMessage(this);
      const status = this.recipientStatus[client.userId];
      if (status !== Constants.RECEIPT_STATE.READ && status !== Constants.RECEIPT_STATE.DELIVERED) {
        this._sendReceipt('delivery');
      }
    }
  }

  /**
   * Get the layer.Client associated with this layer.Message.
   *
   * Uses the layer.Message.clientId property.
   *
   * @method getClient
   * @return {layer.Client}
   */
  getClient() {
    return ClientRegistry.get(this.clientId);
  }

  /**
   * Get the layer.Conversation associated with this layer.Message.
   *
   * Uses the layer.Message.conversationId.
   *
   * @method getConversation
   * @return {layer.Conversation}
   */
  getConversation(load) {
    if (this.conversationId) {
      return ClientRegistry.get(this.clientId).getConversation(this.conversationId, load);
    }
  }

  /**
   * Turn input into valid layer.MessageParts.
   *
   * This method is automatically called any time the parts
   * property is set (including during intialization).  This
   * is where we convert strings into MessageParts, and instances
   * into arrays.
   *
   * @method __adjustParts
   * @private
   * @param  {Mixed} parts -- Could be a string, array, object or MessagePart instance
   * @return {layer.MessagePart[]}
   */
  __adjustParts(parts) {
    if (typeof parts === 'string') {
      return [new MessagePart({
        body: parts,
        mimeType: 'text/plain',
        clientId: this.clientId,
      })];
    } else if (Array.isArray(parts)) {
      return parts.map(part => {
        let result;
        if (part instanceof MessagePart) {
          result = part;
        } else {
          result = new MessagePart(part);
        }
        result.clientId = this.clientId;
        return result;
      });
    } else if (parts && typeof parts === 'object') {
      parts.clientId = this.clientId;
      return [new MessagePart(parts)];
    }
  }


  /**
   * Add a layer.MessagePart to this Message.
   *
   * Should only be called on an unsent Message.
   *
   * @method addPart
   * @param  {layer.MessagePart/Object} part - A layer.MessagePart instance or a `{mimeType: 'text/plain', body: 'Hello'}` formatted Object.
   */
  addPart(part) {
    if (part) {
      part.clientId = this.clientId;
      if (typeof part === 'object') {
        this.parts.push(new MessagePart(part));
      } else if (part instanceof MessagePart) {
        this.parts.push(part);
      }
    }
    return this;
  }

  /**
   * Accessor called whenever the app accesses `message.recipientStatus`.
   *
   * Insures that participants who haven't yet been sent the Message are marked as layer.Constants.RECEIPT_STATE.PENDING
   *
   * @method __getRecipientStatus
   * @param {string} pKey - The actual property key where the value is stored
   * @private
   * @return {Object}
   */
  __getRecipientStatus(pKey) {
    const value = this[pKey] || {};
    const client = this.getClient();
    if (client) {
      const userId = client.userId;
      const conversation = this.getConversation(false);
      if (conversation) {
        conversation.participants.forEach(participant => {
          if (!value[participant]) {
            value[participant] = participant === userId ?
              Constants.RECEIPT_STATE.READ : Constants.RECEIPT_STATE.PENDING;
          }
        });
      }
    }
    return value;
  }

  /**
   * Handle changes to the recipientStatus property.
   *
   * Any time the recipientStatus property is set,
   * Recalculate all of the receipt related properties:
   *
   * 1. isRead
   * 2. readStatus
   * 3. deliveryStatus
   *
   * @method __updateRecipientStatus
   * @private
   * @param  {Object} status - Object describing the delivered/read/sent value for each participant
   *
   */
  __updateRecipientStatus(status, oldStatus) {
    const conversation = this.getConversation(false);
    const client = this.getClient();

    if (!conversation || Util.doesObjectMatch(status, oldStatus)) return;

    const userId = client.userId;
    const isSender = this.sender.userId === userId;
    const userHasRead = status[userId] === Constants.RECEIPT_STATE.READ;

    try {
      // -1 so we don't count this user
      const userCount = conversation.participants.length - 1;

      // If sent by this user or read by this user, update isRead/unread
      if (!this.__isRead && (isSender || userHasRead)) {
        this.__isRead = true; // no __updateIsRead event fired
      }

      // Update the readStatus/deliveryStatus properties
      const { readCount, deliveredCount } = this._getReceiptStatus(status, userId);
      this._setReceiptStatus(readCount, deliveredCount, userCount);
    } catch (error) {
      // Do nothing
    }

    // Only trigger an event
    // 1. we're not initializing a new Message
    // 2. the user's state has been updated to read; we don't care about updates from other users if we aren't the sender.
    //    We also don't care about state changes to delivered; these do not inform rendering as the fact we are processing it
    //    proves its delivered.
    // 3. The user is the sender; in that case we do care about rendering receipts from other users
    if (!this.isInitializing && oldStatus) {
      const usersStateUpdatedToRead = userHasRead && oldStatus[userId] !== Constants.RECEIPT_STATE.READ;
      if (usersStateUpdatedToRead || isSender) {
        this._triggerAsync('messages:change', {
          oldValue: oldStatus,
          newValue: status,
          property: 'recipientStatus',
        });
      }
    }
  }

  /**
   * Get the number of participants who have read and been delivered
   * this Message
   *
   * @method _getReceiptStatus
   * @private
   * @param  {Object} status - Object describing the delivered/read/sent value for each participant
   * @param  {string} userId - User ID for this user; not counted when reporting on how many people have read/received.
   * @return {Object} result
   * @return {number} result.readCount
   * @return {number} result.deliveredCount
   */
  _getReceiptStatus(status, userId) {
    let readCount = 0,
      deliveredCount = 0;
    Object.keys(status).filter(participant => participant !== userId).forEach(participant => {
      if (status[participant] === Constants.RECEIPT_STATE.READ) {
        readCount++;
        deliveredCount++;
      } else if (status[participant] === Constants.RECEIPT_STATE.DELIVERED) {
        deliveredCount++;
      }
    });

    return {
      readCount,
      deliveredCount,
    };
  }

  /**
   * Sets the layer.Message.readStatus and layer.Message.deliveryStatus properties.
   *
   * @method _setReceiptStatus
   * @private
   * @param  {number} readCount
   * @param  {number} deliveredCount
   * @param  {number} userCount
   */
  _setReceiptStatus(readCount, deliveredCount, userCount) {
    if (readCount === userCount) {
      this.readStatus = Constants.RECIPIENT_STATE.ALL;
    } else if (readCount > 0) {
      this.readStatus = Constants.RECIPIENT_STATE.SOME;
    } else {
      this.readStatus = Constants.RECIPIENT_STATE.NONE;
    }
    if (deliveredCount === userCount) {
      this.deliveryStatus = Constants.RECIPIENT_STATE.ALL;
    } else if (deliveredCount > 0) {
      this.deliveryStatus = Constants.RECIPIENT_STATE.SOME;
    } else {
      this.deliveryStatus = Constants.RECIPIENT_STATE.NONE;
    }
  }

  /**
   * Handle changes to the isRead property.
   *
   * If someone called m.isRead = true, AND
   * if it was previously false, AND
   * if the call didn't come from layer.Message.__updateRecipientStatus,
   * Then notify the server that the message has been read.
   *
   *
   * @method __updateIsRead
   * @private
   * @param  {boolean} value - True if isRead is true.
   */
  __updateIsRead(value) {
    if (value) {
      this._sendReceipt(Constants.RECEIPT_STATE.READ);
      this._triggerAsync('messages:read');
      const conversation = this.getConversation(false);
      if (conversation) conversation.unreadCount--;
    }
  }


  /**
   * Send a Read or Delivery Receipt to the server.
   *
   * @method sendReceipt
   * @param {string} [type=layer.Constants.RECEIPT_STATE.READ] - One of layer.Constants.RECEIPT_STATE.READ or layer.Constants.RECEIPT_STATE.DELIVERY
   * @return {layer.Message} this
   */
  sendReceipt(type = Constants.RECEIPT_STATE.READ) {
    if (type === Constants.RECEIPT_STATE.READ) {
      if (this.isRead) {
        return this;
      } else {
        // Without triggering the event, clearObject isn't called,
        // which means those using the toObject() data will have an isRead that doesn't match
        // this instance.  Which typically leads to lots of extra attempts
        // to mark the message as read.
        this.__isRead = true;
        this._triggerAsync('messages:read');
        const conversation = this.getConversation(false);
        if (conversation) conversation.unreadCount--;
      }
    }
    this._sendReceipt(type);
    return this;
  }

  /**
   * Send a Read or Delivery Receipt to the server.
   *
   * This bypasses any validation and goes direct to sending to the server.
   *
   * NOTE: Server errors are not handled; the local receipt state is suitable even
   * if out of sync with the server.
   *
   * @method _sendReceipt
   * @private
   * @param {string} [type=read] - One of layer.Constants.RECEIPT_STATE.READ or layer.Constants.RECEIPT_STATE.DELIVERY
   */
  _sendReceipt(type) {
    // This little test exists so that we don't send receipts on Conversations we are no longer
    // participants in (participants = [] if we are not a participant)
    const conversation = this.getConversation(false);
    if (conversation && conversation.participants.length === 0) return;

    this._setSyncing();
    this._xhr({
      url: '/receipts',
      method: 'POST',
      data: {
        type,
      },
      sync: {
        // This should not be treated as a POST/CREATE request on the Message
        operation: 'RECEIPT',
      },
    }, () => this._setSynced());
  }

  /**
   * Send the message to all participants of the Conversation.
   *
   * Message must have parts and a valid conversation to send successfully.
   *
   * @method send
   * @param {Object} [notification] - Parameters for controling how the phones manage notifications of the new Message.
   *                          See IOS and Android docs for details.
   * @param {string} [notification.text] - Text of your notification
   * @param {string} [notification.sound] - Name of an audio file or other sound-related hint
   * @return {layer.Message} this
   */
  send(notification) {
    const client = this.getClient();
    if (!client) {
      throw new Error(LayerError.dictionary.clientMissing);
    }

    const conversation = this.getConversation(true);

    if (!conversation) {
      throw new Error(LayerError.dictionary.conversationMissing);
    }

    if (this.syncState !== Constants.SYNC_STATE.NEW) {
      throw new Error(LayerError.dictionary.alreadySent);
    }


    if (conversation.isLoading) {
      return conversation.once('conversations:loaded', () => this.send(notification));
    }

    if (!this.parts || !this.parts.length) {
      throw new Error(LayerError.dictionary.partsMissing);
    }

    this.sender.userId = client.userId;
    this._setSyncing();
    client._addMessage(this);

    // Make sure that the Conversation has been created on the server
    // and update the lastMessage property
    conversation.send(this);

    // allow for modification of message before sending
    this.trigger('messages:sending');

    const data = {
      parts: new Array(this.parts.length),
      id: this.id,
    };
    if (notification) data.notification = notification;

    this._preparePartsForSending(data);
    return this;
  }

  /**
   * Insures that each part is ready to send before actually sending the Message.
   *
   * @method _preparePartsForSending
   * @private
   * @param  {Object} structure to be sent to the server
   */
  _preparePartsForSending(data) {
    const client = this.getClient();
    let count = 0;
    this.parts.forEach((part, index) => {
      part.once('parts:send', evt => {
        data.parts[index] = {
          mime_type: evt.mime_type,
        };
        if (evt.content) data.parts[index].content = evt.content;
        if (evt.body) data.parts[index].body = evt.body;
        if (evt.encoding) data.parts[index].encoding = evt.encoding;

        count++;
        if (count === this.parts.length) {
          this._send(data);
        }
      }, this);
      part._send(client);
    });
  }

  /**
   * Handle the actual sending.
   *
   * layer.Message.send has some potentially asynchronous
   * preprocessing to do before sending (Rich Content); actual sending
   * is done here.
   *
   * @method _send
   * @private
   */
  _send(data) {
    const client = this.getClient();
    const conversation = this.getConversation(false);

    this.sentAt = new Date();
    client.sendSocketRequest({
      method: 'POST',
      body: {
        method: 'Message.create',
        object_id: conversation.id,
        data,
      },
      sync: {
        depends: [this.conversationId, this.id],
        target: this.id,
      },
    }, (success, socketData) => this._sendResult(success, socketData));
  }

  _getSendData(data) {
    data.object_id = this.conversationId;
    return data;
  }

  /**
    * layer.Message.send() Success Callback.
    *
    * If successfully sending the message; triggers a 'sent' event,
    * and updates the message.id/url
    *
    * @method _sendResult
    * @private
    * @param {Object} messageData - Server description of the message
    */
  _sendResult({ success, data }) {
    if (this.isDestroyed) return;

    if (success) {
      this._populateFromServer(data);
      this._triggerAsync('messages:sent');
    } else {
      this.trigger('messages:sent-error', { error: data });
      this.destroy();
    }
    this._setSynced();
  }

  /**
     * Standard `on()` provided by layer.Root.
     *
     * Adds some special handling of 'messages:loaded' so that calls such as
     *
     *      var m = client.getMessage('layer:///messages/123', true)
     *      .on('messages:loaded', function() {
     *          myrerender(m);
     *      });
     *      myrender(m); // render a placeholder for m until the details of m have loaded
     *
     * can fire their callback regardless of whether the client loads or has
     * already loaded the Message.
     *
     * @method on
     * @param  {string} eventName
     * @param  {Function} eventHandler
     * @param  {Object} context
     * @return {layer.Message} this
     */
  on(name, callback, context) {
    const hasLoadedEvt = name === 'messages:loaded' ||
      name && typeof name === 'object' && name['messages:loaded'];

    if (hasLoadedEvt && !this.isLoading) {
      const callNow = name === 'messages:loaded' ? callback : name['messages:loaded'];
      Util.defer(() => callNow.apply(context));
    }
    super.on(name, callback, context);
    return this;
  }

  /**
   * Delete the Message from the server.
   *
   * This call will support various deletion modes.  Calling without a deletion mode is deprecated.
   *
   * Deletion Modes:
   *
   * * layer.Constants.DELETION_MODE.ALL: This deletes the local copy immediately, and attempts to also
   *   delete the server's copy.
   *
   * @method delete
   * @param {number} deletionMode - layer.Constants.DELETION_MODE.ALL is only supported mode at this time
   */
  delete(mode) {
    if (this.isDestroyed) throw new Error(LayerError.dictionary.isDestroyed);

    let queryStr;
    switch (mode) {
      case Constants.DELETION_MODE.ALL:
      case true:
        queryStr = 'mode=all_participants';
        break;
      case Constants.DELETION_MODE.MY_DEVICES:
        queryStr = 'mode=my_devices';
        break;
      default:
        throw new Error(LayerError.dictionary.deletionModeUnsupported);
    }

    const id = this.id;
    const client = this.getClient();
    this._xhr({
      url: '?' + queryStr,
      method: 'DELETE',
    }, result => {
      if (!result.success && (!result.data || result.data.id !== 'not_found')) Message.load(id, client);
    });

    this._deleted();
    this.destroy();
  }

  /**
   * The Message has been deleted.
   *
   * Called from layer.Websockets.ChangeManager and from layer.Message.delete();
   *
   * Destroy must be called separately, and handles most cleanup.
   *
   * @method _deleted
   * @protected
   */
  _deleted() {
    this.trigger('messages:delete');
  }

  /**
   * Remove this Message from the system.
   *
   * This will deregister the Message, remove all events
   * and allow garbage collection.
   *
   * @method destroy
   */
  destroy() {
    const client = this.getClient();
    if (client) client._removeMessage(this);
    this.parts.forEach(part => part.destroy());
    this.__parts = null;

    super.destroy();
  }

  /**
   * Populates this instance with the description from the server.
   *
   * Can be used for creating or for updating the instance.
   *
   * @method _populateFromServer
   * @protected
   * @param  {Object} m - Server description of the message
   */
  _populateFromServer(message) {
    this.id = message.id;
    this.url = message.url;
    const oldPosition = this.position;
    this.position = message.position;


    // Assign IDs to preexisting Parts so that we can call getPartById()
    if (this.parts) {
      this.parts.forEach((part, index) => {
        if (!part.id) part.id = `${this.id}/parts/${index}`;
      });
    }

    this.parts = message.parts.map(part => {
      const existingPart = this.getPartById(part.id);
      if (existingPart) {
        existingPart._populateFromServer(part);
        return existingPart;
      } else {
        return MessagePart._createFromServer(part);
      }
    });

    this.recipientStatus = message.recipient_status || {};

    this.isRead = !message.is_unread;

    this.sentAt = new Date(message.sent_at);
    this.receivedAt = message.received_at ? new Date(message.received_at) : undefined;

    this.sender = {
      userId: message.sender.user_id || '',
      name: message.sender.name || '',
    };

    this._setSynced();

    if (oldPosition && oldPosition !== this.position) {
      this._triggerAsync('messages:change', {
        oldValue: oldPosition,
        newValue: this.position,
        property: 'position',
      });
    }
  }

  /**
   * Returns the Message's layer.MessagePart with the specified the part ID.
   *
   * @method getPartById
   * @param {string} partId
   * @return {layer.MessagePart}
   */
  getPartById(partId) {
    return this.parts ? this.parts.filter(part => part.id === partId)[0] : null;
  }

  /**
   * Accepts json-patch operations for modifying recipientStatus.
   *
   * @method _handlePatchEvent
   * @private
   * @param  {Object[]} data - Array of operations
   */
  _handlePatchEvent(newValue, oldValue, paths) {
    this._inLayerParser = false;
    if (paths[0].indexOf('recipient_status') === 0) {
      this.__updateRecipientStatus(this.recipientStatus, oldValue);
    }
    this._inLayerParser = true;
  }


  /**
   * Any xhr method called on this message uses the message's url.
   *
   * For more info on xhr method parameters see {@link layer.ClientAuthenticator#xhr}
   *
   * @method _xhr
   * @protected
   * @return {layer.Message} this
   */
  _xhr(options, callback) {
    // initialize
    let inUrl = options.url;
    const client = this.getClient();

    // Validatation
    if (this.isDestroyed) throw new Error(LayerError.dictionary.isDestroyed);
    if (!('url' in options)) throw new Error(LayerError.dictionary.urlRequired);

    if (inUrl && !inUrl.match(/^(\/|\?)/)) options.url = inUrl = '/' + options.url;
    if (!options.sync) options.url = this.url + options.url;

    // Setup sync structure
    options.sync = this._setupSyncObject(options.sync);

    client.xhr(options, callback);
    return this;
  }

  _getUrl(url) {
    return this.url + (url || '');
  }

  _setupSyncObject(sync) {
    if (sync !== false) {
      if (!sync) sync = {};
      if (!sync.target) sync.target = this.id;
      if (!sync.depends) {
        sync.depends = [this.conversationId];
      } else if (sync.depends.indexOf(this.id) === -1) {
        sync.depends.push(this.conversationId);
      }
    }
    return sync;
  }


  /**
   * Get all text parts of the Message.
   *
   * Utility method for extracting all of the text/plain parts
   * and concatenating all of their bodys together into a single string.
   *
   * @method getText
   * @param {string} [joinStr='.  '] If multiple message parts of type text/plain, how do you want them joined together?
   * @return {string}
   */
  getText(joinStr = '. ') {
    let textArray = this.parts
      .filter(part => part.mimeType === 'text/plain')
      .map(part => part.body);
    textArray = textArray.filter(data => data);
    return textArray.join(joinStr);
  }

  /**
   * Returns a plain object.
   *
   * Object will have all the same public properties as this
   * Message instance.  New object is returned any time
   * any of this object's properties change.
   *
   * @method toObject
   * @return {Object} POJO version of this object.
   */
  toObject() {
    if (!this._toObject) {
      this._toObject = super.toObject();
      this._toObject.recipientStatus = Util.clone(this.recipientStatus);
      this._toObject.isNew = this.isNew();
      this._toObject.isSaving = this.isSaving();
      this._toObject.isSaved = this.isSaved();
      this._toObject.isSynced = this.isSynced();
    }
    return this._toObject;
  }

  _triggerAsync(evtName, args) {
    this._clearObject();
    super._triggerAsync(evtName, args);
  }

  trigger(evtName, args) {
    this._clearObject();
    super.trigger(evtName, args);
  }

  /**
   * Creates a message from the server's representation of a message.
   *
   * Similar to _populateFromServer, however, this method takes a
   * message description and returns a new message instance using _populateFromServer
   * to setup the values.
   *
   * @method _createFromServer
   * @protected
   * @static
   * @param  {Object} message - Server's representation of the message
   * @param  {layer.Client} client
   * @return {layer.Message}
   */
  static _createFromServer(message, client) {
    const fromWebsocket = message.fromWebsocket;
    return new Message({
      conversationId: message.conversation.id,
      fromServer: message,
      clientId: client.appId,
      _fromDB: message._fromDB,
      _notify: fromWebsocket && message.is_unread && message.sender.user_id !== client.userId,
    });
  }

  _loaded(data) {
    this.conversationId = data.conversation.id;
    this.getClient()._addMessage(this);
  }

  /**
   * Identifies whether a Message receiving the specified patch data should be loaded from the server.
   *
   * Applies only to Messages that aren't already loaded; used to indicate if a change event is
   * significant enough to load the Message and trigger change events on that Message.
   *
   * At this time there are no properties that are patched on Messages via websockets
   * that would justify loading the Message from the server so as to notify the app.
   *
   * Only recipient status changes and maybe is_unread changes are sent;
   * neither of which are relevant to an app that isn't rendering that message.
   *
   * @method _loadResourceForPatch
   * @static
   * @private
   */
  static _loadResourceForPatch(patchData) {
    return false;
  }
}

/**
 * Client that the Message belongs to.
 *
 * Actual value of this string matches the appId.
 * @type {string}
 */
Message.prototype.clientId = '';

/**
 * Conversation that this Message belongs to.
 *
 * Actual value is the ID of the Conversation's ID.
 *
 * @type {string}
 */
Message.prototype.conversationId = '';

/**
 * Array of layer.MessagePart objects
 *
 * @type {layer.MessagePart[]}
 */
Message.prototype.parts = null;

/**
 * Message Identifier.
 *
 * This value is shared by all participants and devices.
 *
 * @type {String}
 */
Message.prototype.id = '';

/**
 * URL to the server endpoint for operating on the message.
 * @type {String}
 */
Message.prototype.url = '';

/**
 * Time that the message was sent.
 * @type {Date}
 */
Message.prototype.sentAt = null;

/**
 * Time that the first delivery receipt was sent by your
 * user acknowledging receipt of the message.
 * @type {Date}
 */
Message.prototype.receivedAt = null;

/**
 * Object representing the sender of the Message.
 *
 * Contains `userId` property which is
 * populated when the message was sent by a participant (or former participant)
 * in the Conversation.  Contains a `name` property which is
 * used when the Message is sent via a Named Platform API sender
 * such as "Admin", "Moderator", "Robot Jerking you Around".
 *
 *      <span class='sent-by'>
 *        {message.sender.name || getDisplayNameForId(message.sender.userId)}
 *      </span>
 *
 * @type {Object}
 */
Message.prototype.sender = null;

/**
 * Position of this message within the conversation.
 *
 * NOTES:
 *
 * 1. Deleting a message does not affect position of other Messages.
 * 2. A position is not gaurenteed to be unique (multiple messages sent at the same time could
 * all claim the same position)
 * 3. Each successive message within a conversation should expect a higher position.
 *
 * @type {Number}
 */
Message.prototype.position = 0;

/**
 * Hint used by layer.Client on whether to trigger a messages:notify event.
 *
 * @type {boolean}
 * @private
 */
Message.prototype._notify = false;

/* Recipient Status */

/**
 * Read/delivery State of all participants.
 *
 * This is an object containing keys for each participant,
 * and a value of:
 * * layer.RECEIPT_STATE.SENT
 * * layer.RECEIPT_STATE.DELIVERED
 * * layer.RECEIPT_STATE.READ
 * * layer.RECEIPT_STATE.PENDING
 *
 * @type {Object}
 */
Message.prototype.recipientStatus = null;

/**
 * True if this Message has been read by this user.
 *
 * You can change isRead programatically
 *
 *      m.isRead = true;
 *
 * This will automatically notify the server that the message was read by your user.
 * @type {Boolean}
 */
Message.prototype.isRead = false;

/**
 * This property is here for convenience only; it will always be the opposite of isRead.
 * @type {Boolean}
 * @readonly
 */
Object.defineProperty(Message.prototype, 'isUnread', {
  enumerable: true,
  get: function get() {
    return !this.isRead;
  },
});

/**
 * Have the other participants read this Message yet.
 *
 * This value is one of:
 *
 *  * layer.Constants.RECIPIENT_STATE.ALL
 *  * layer.Constants.RECIPIENT_STATE.SOME
 *  * layer.Constants.RECIPIENT_STATE.NONE
 *
 *  This value is updated any time recipientStatus changes.
 *
 * @type {String}
 */
Message.prototype.readStatus = Constants.RECIPIENT_STATE.NONE;

/**
 * Have the other participants received this Message yet.
 *
  * This value is one of:
 *
 *  * layer.Constants.RECIPIENT_STATE.ALL
 *  * layer.Constants.RECIPIENT_STATE.SOME
 *  * layer.Constants.RECIPIENT_STATE.NONE
 *
 *  This value is updated any time recipientStatus changes.
 *
 *
 * @type {String}
 */
Message.prototype.deliveryStatus = Constants.RECIPIENT_STATE.NONE;

/**
 * The time that this client created this instance.
 * @type {Date}
 */
Message.prototype.localCreatedAt = null;

Message.prototype._toObject = null;

Message.prototype._fromDB = false;

Message.eventPrefix = 'messages';

Message.prefixUUID = 'layer:///messages/';

Message.inObjectIgnore = Syncable.inObjectIgnore;

Message.bubbleEventParent = 'getClient';

Message.imageTypes = [
  'image/gif',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

Message._supportedEvents = [

  /**
   * Message has been loaded from the server.
   *
   * Note that this is only used in response to the layer.Message.load() method.
   * @event
   * @param {layer.LayerEvent} evt
   */
  'messages:loaded',

  /**
   * The load method failed to load the message from the server.
   *
   * Note that this is only used in response to the layer.Message.load() method.
   * @event
   * @param {layer.LayerEvent} evt
   */
  'messages:loaded-error',

  /**
   * Message deleted from the server.
   *
   * Caused by a call to layer.Message.delete() or a websocket event.
   * @param {layer.LayerEvent} evt
   * @event
   */
  'messages:delete',

  /**
   * Message is about to be sent.
   *
   * Last chance to modify or validate the message prior to sending.
   *
   *     message.on('messages:sending', function(evt) {
   *        message.addPart({mimeType: 'application/location', body: JSON.stringify(getGPSLocation())});
   *     });
   *
   * Typically, you would listen to this event more broadly using `client.on('messages:sending')`
   * which would trigger before sending ANY Messages.
   *
   * @event
   * @param {layer.LayerEvent} evt
   */
  'messages:sending',

  /**
   * Message has been received by the server.
   *
   * It does NOT indicate delivery to other users.
   *
   * It does NOT indicate messages sent by other users.
   *
   * @event
   * @param {layer.LayerEvent} evt
   */
  'messages:sent',

  /**
   * Server failed to receive the Message.
   *
   * Message will be deleted immediately after firing this event.
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.LayerError} evt.error
   */
  'messages:sent-error',

  /**
   * Fired when message.isRead is set to true.
   *
   * Sometimes this event is triggered by marking the Message as read locally; sometimes its triggered
   * by your user on a separate device/browser marking the Message as read remotely.
   *
   * Useful if you style unread messages in bold, and need an event to tell you when
   * to unbold the message.
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message[]} evt.messages - Array of messages that have just been marked as read
   */
  'messages:read',

  /**
   * The recipientStatus property has changed.
   *
   * This happens in response to an update
   * from the server... but is also caused by marking the current user has having read
   * or received the message.
   * @event
   * @param {layer.LayerEvent} evt
   */
  'messages:change',


].concat(Syncable._supportedEvents);

Root.initClass.apply(Message, [Message, 'Message']);
Syncable.subclasses.push(Message);
module.exports = Message;
