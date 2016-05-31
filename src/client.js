/**
 * The Layer Client; this is the top level component for any Layer based application.

    var client = new layer.Client({
      appId: 'layer:///apps/staging/ffffffff-ffff-ffff-ffff-ffffffffffff',
      userId: 'Fred',
      challenge: function(evt) {
        myAuthenticator({
          nonce: evt.nonce,
          onSuccess: evt.callback
        });
      },
      ready: function(client) {
        alert('I am Client; Server: Serve me!');
      }
    });
 *
 * You can also initialize this as

    var client = new layer.Client({
      appId: 'layer:///apps/staging/ffffffff-ffff-ffff-ffff-ffffffffffff',
      userId: 'Fred'
    });

    client.on('challenge', function(evt) {
      myAuthenticator({
        nonce: evt.nonce,
        onSuccess: evt.callback
      });
    });

    client.on('ready', function(client) {
      alert('I am Client; Server: Serve me!');
    });
 *
 * ## API Synopsis:
 *
 * The following Properties, Methods and Events are the most commonly used ones.  See the full API below
 * for the rest of the API.
 *
 * ### Properties:
 *
 * * layer.Client.userId: User ID of the authenticated user
 * * layer.Client.appId: The ID for your application
 *
 *
 * ### Methods:
 *
 * * layer.Client.createConversation(): Create a new layer.Conversation.
 * * layer.Client.createQuery(): Create a new layer.Query.
 * * layer.Client.getMessage(): Input a Message ID, and output a Message from cache.
 * * layer.Client.getConversation(): Input a Conversation ID, and output a Conversation from cache.
 * * layer.Client.on() and layer.Conversation.off(): event listeners
 * * layer.Client.destroy(): Cleanup all resources used by this client, including all Messages and Conversations.
 *
 * ### Events:
 *
 * * `challenge`: Provides a nonce and a callback; you call the callback once you have an Identity Token.
 * * `ready`: Your application can now start using the Layer services
 * * `messages:notify`: Used to notify your application of new messages for which a local notification may be suitable.
 *
 * ## Logging:
 *
 * There are two ways to change the log level for Layer's logger:
 *
 *     layer.Client.prototype.logLevel = layer.Constants.LOG.INFO;
 *
 * or
 *
 *     var client = new layer.Client({
 *        appId: 'layer:///apps/staging/ffffffff-ffff-ffff-ffff-ffffffffffff',
 *        userId: 'Fred',
 *        logLevel: layer.Constants.LOG.INFO
 *     });
 *
 * @class  layer.Client
 * @extends layer.ClientAuthenticator
 *
 */

const ClientAuth = require('./client-authenticator');
const Conversation = require('./conversation');
const Query = require('./query');
const LayerError = require('./layer-error');
const Syncable = require('./syncable');
const Message = require('./message');
const Announcement = require('./announcement');
const { Identity, UserIdentity, ServiceIdentity } = require('./identity');
const TypingIndicatorListener = require('./typing-indicators/typing-indicator-listener');
const Util = require('./client-utils');
const Root = require('./root');
const ClientRegistry = require('./client-registry');
const logger = require('./logger');

class Client extends ClientAuth {

  /*
   * Adds conversations, messages and websockets on top of the authentication client.
   * jsdocs on parent class constructor.
   */
  constructor(options) {
    super(options);
    ClientRegistry.register(this);

    // Initialize Properties
    this._conversationsHash = {};
    this._messagesHash = {};
    this._queriesHash = {};
    this._identitiesHash = {};
    this._serviceIdentitiesHash = {};
    this._scheduleCheckAndPurgeCacheItems = [];

    this._initComponents();

    this.on('online', this._connectionRestored.bind(this));
  }

  /* See parent method docs */
  _initComponents() {
    super._initComponents();

    this._typingIndicators = new TypingIndicatorListener({
      clientId: this.appId,
    });

    // Instantiate Plugins
    Object.keys(Client.plugins).forEach(propertyName => {
      this[propertyName] = new Client.plugins[propertyName](this);
    });
  }

  /**
   * Cleanup all resources (Conversations, Messages, etc...) prior to destroy or reauthentication.
   *
   * @method _cleanup
   * @private
   */
  _cleanup() {
    if (this.isDestroyed) return;
    this._inCleanup = true;

    Object.keys(this._conversationsHash).forEach(id => {
      const c = this._conversationsHash[id];
      if (c && !c.isDestroyed) {
        c.destroy();
      }
    });
    this._conversationsHash = null;

    Object.keys(this._messagesHash).forEach(id => {
      const m = this._messagesHash[id];
      if (m && !m.isDestroyed) {
        m.destroy();
      }
    });
    this._messagesHash = null;

    Object.keys(this._queriesHash).forEach(id => {
      this._queriesHash[id].destroy();
    });
    this._queriesHash = null;

    Object.keys(this._identitiesHash).forEach((id) => {
      const identity = this._identitiesHash[id];
      if (identity && !identity.isDestroyed) {
        identity.destroy();
      }
    });
    this._identitiesHash = null;

    Object.keys(this._serviceIdentitiesHash).forEach((id) => {
      const identity = this._serviceIdentitiesHash[id];
      if (identity && !identity.isDestroyed) {
        identity.destroy();
      }
    });
    this._serviceIdentitiesHash = null;

    if (this.socketManager) this.socketManager.close();
  }

  destroy() {
    // Cleanup all plugins
    Object.keys(Client.plugins).forEach(propertyName => {
      if (this[propertyName]) {
        this[propertyName].destroy();
        delete this[propertyName];
      }
    });

    // Cleanup all resources (Conversations, Messages, etc...)
    this._cleanup();

    this._destroyComponents();

    ClientRegistry.unregister(this);

    super.destroy();
    this._inCleanup = false;
  }

  /**
   * Retrieve a conversation by Identifier.
   *
   *      var c = client.getConversation('layer:///conversations/uuid');
   *
   * If there is not a conversation with that id, it will return null.
   *
   * If you want it to load it from cache and then from server if not in cache, use the `canLoad` parameter.
   * If loading from the server, the method will return
   * a layer.Conversation instance that has no data; the conversations:loaded/conversations:loaded-error events
   * will let you know when the conversation has finished/failed loading from the server.
   *
   *      var c = client.getConversation('layer:///conversations/123', true)
   *      .on('conversations:loaded', function() {
   *          // Render the Conversation with all of its details loaded
   *          myrerender(c);
   *      });
   *      // Render a placeholder for c until the details of c have loaded
   *      myrender(c);
   *
   * @method getConversation
   * @param  {string} id
   * @param  {boolean} [canLoad=false] - Pass true to allow loading a conversation from
   *                                    the server if not found
   * @return {layer.Conversation}
   */
  getConversation(id, canLoad) {
    if (typeof id !== 'string') throw new Error(LayerError.dictionary.idParamRequired);
    if (this._conversationsHash[id]) {
      return this._conversationsHash[id];
    } else if (canLoad) {
      return Conversation.load(id, this);
    }
    return null;
  }

  /**
   * Adds a conversation to the client.
   *
   * Typically, you do not need to call this; the following code
   * automatically calls _addConversation for you:
   *
   *      var conv = new layer.Conversation({
   *          client: client,
   *          participants: ['a', 'b']
   *      });
   *
   *      // OR:
   *      var conv = client.createConversation(['a', 'b']);
   *
   * @method _addConversation
   * @protected
   * @param  {layer.Conversation} c
   * @returns {layer.Client} this
   */
  _addConversation(conversation) {
    const id = conversation.id;
    if (!this._conversationsHash[id]) {
      // Register the Conversation
      this._conversationsHash[id] = conversation;

      // Make sure the client is set so that the next event bubbles up
      if (conversation.clientId !== this.appId) conversation.clientId = this.appId;
      this._triggerAsync('conversations:add', { conversations: [conversation] });

      this._scheduleCheckAndPurgeCache(conversation);
    }
    return this;
  }

  /**
   * Removes a conversation from the client.
   *
   * Typically, you do not need to call this; the following code
   * automatically calls _removeConversation for you:
   *
   *      converation.destroy();
   *
   * @method _removeConversation
   * @protected
   * @param  {layer.Conversation} c
   * @returns {layer.Client} this
   */
  _removeConversation(conversation) {
    // Insure we do not get any events, such as message:remove
    conversation.off(null, null, this);

    if (this._conversationsHash[conversation.id]) {
      delete this._conversationsHash[conversation.id];
      this._triggerAsync('conversations:remove', { conversations: [conversation] });
    }

    // Remove any Message associated with this Conversation
    Object.keys(this._messagesHash).forEach(id => {
      if (this._messagesHash[id].conversationId === conversation.id) {
        this._messagesHash[id].destroy();
      }
    });

    return this;
  }

  /**
   * If the Conversation ID changes, we need to reregister the Conversation
   *
   * @method _updateConversationId
   * @protected
   * @param  {layer.Conversation} conversation - Conversation whose ID has changed
   * @param  {string} oldId - Previous ID
   */
  _updateConversationId(conversation, oldId) {
    if (this._conversationsHash[oldId]) {
      this._conversationsHash[conversation.id] = conversation;
      delete this._conversationsHash[oldId];

      // This is a nasty way to work... but need to find and update all
      // conversationId properties of all Messages or the Query's won't
      // see these as matching the query.
      Object.keys(this._messagesHash)
            .filter(id => this._messagesHash[id].conversationId === oldId)
            .forEach(id => (this._messagesHash[id].conversationId = conversation.id));
    }
  }


  /**
   * Retrieve the message or announcement id.
   *
   * Useful for finding a message when you have only the ID.
   *
   * If the message is not found, it will return null.
   *
   * If you want it to load it from cache and then from server if not in cache, use the `canLoad` parameter.
   * If loading from the server, the method will return
   * a layer.Message instance that has no data; the messages:loaded/messages:loaded-error events
   * will let you know when the message has finished/failed loading from the server.
   *
   *      var m = client.getMessage('layer:///messages/123', true)
   *      .on('messages:loaded', function() {
   *          // Render the Message with all of its details loaded
   *          myrerender(m);
   *      });
   *      // Render a placeholder for m until the details of m have loaded
   *      myrender(m);
   *
   *
   * @method getMessage
   * @param  {string} id              - layer:///messages/uuid
   * @param  {boolean} [canLoad=false] - Pass true to allow loading a message from the server if not found
   * @return {layer.Message}
   */
  getMessage(id, canLoad) {
    if (typeof id !== 'string') throw new Error(LayerError.dictionary.idParamRequired);

    if (this._messagesHash[id]) {
      return this._messagesHash[id];
    } else if (canLoad) {
      return Syncable.load(id, this);
    }
    return null;
  }

  /**
   * Get a MessagePart by ID
   * @method getMessagePart
   * @param {String} id - ID of the Message Part; layer:///messages/uuid/parts/5
   */
  getMessagePart(id) {
    if (typeof id !== 'string') throw new Error(LayerError.dictionary.idParamRequired);

    const messageId = id.replace(/\/parts.*$/, '');
    const message = this.getMessage(messageId);
    if (message) return message.getPartById(id);
  }

  /**
   * Registers a message in _messagesHash and triggers events.
   *
   * May also update Conversation.lastMessage.
   *
   * @method _addMessage
   * @protected
   * @param  {layer.Message} message
   */
  _addMessage(message) {
    if (!this._messagesHash[message.id]) {
      this._messagesHash[message.id] = message;
      this._triggerAsync('messages:add', { messages: [message] });
      if (message._notify) {
        this._triggerAsync('messages:notify', { message });
        message._notify = false;
      }

      const conversation = message.getConversation(false);
      if (conversation && (!conversation.lastMessage || conversation.lastMessage.position < message.position)) {
        const lastMessageWas = conversation.lastMessage;
        conversation.lastMessage = message;
        if (lastMessageWas) this._scheduleCheckAndPurgeCache(lastMessageWas);
      } else {
        this._scheduleCheckAndPurgeCache(message);
      }
    }
  }

  /**
   * Removes message from _messagesHash.
   *
   * Accepts IDs or Message instances
   *
   * TODO: Remove support for remove by ID
   *
   * @method _removeMessage
   * @private
   * @param  {layer.Message|string} message or Message ID
   */
  _removeMessage(message) {
    const id = (typeof message === 'string') ? message : message.id;
    message = this._messagesHash[id];
    if (message) {
      delete this._messagesHash[id];
      if (!this._inCleanup) {
        this._triggerAsync('messages:remove', { messages: [message] });
        const conv = message.getConversation(false);
        if (conv && conv.lastMessage === message) conv.lastMessage = null;
      }
    }
  }

  /**
   * Handles delete from position event from Websocket.
   *
   * A WebSocket may deliver a `delete` Conversation event with a
   * from_position field indicating that all Messages at the specified position
   * and earlier should be deleted.
   *
   * @method _purgeMessagesByPosition
   * @private
   * @param {string} conversationId
   * @param {number} fromPosition
   */
  _purgeMessagesByPosition(conversationId, fromPosition) {
    Object.keys(this._messagesHash).forEach(mId => {
      const message = this._messagesHash[mId];
      if (message.conversationId === conversationId && message.position <= fromPosition) {
        message.destroy();
      }
    });
  }

  /**
   * Retrieve a identity by Identifier.
   *
   *      var i1 = client.getIdentity('layer:///identities/user_id');
   *      var i2 = client.getIdentity('layer:///serviceidentities/service_name');
   *
   * If there is not an Identity with that id, it will return null.
   *
   * If you want it to load it from cache and then from server if not in cache, use the `canLoad` parameter.
   * This is only supported for User Identities, not Service Identities.
   *
   * If loading from the server, the method will return
   * a layer.UserIdentity instance that has no data; the identities:loaded/identities:loaded-error events
   * will let you know when the identity has finished/failed loading from the server.
   *
   *      var user = client.getIdentity('layer:///identities/123', true)
   *      .on('identities:loaded', function() {
   *          // Render the user list with all of its details loaded
   *          myrerender(user);
   *      });
   *      // Render a placeholder for user until the details of user have loaded
   *      myrender(user);
   *
   * @method getIdentity
   * @param  {string} id - Accepts full Layer ID (layer:///identities/frodo-the-dodo) or just the UserID (frodo-the-dodo).
   *                       If its just a UserID, its presumed to be a UserIdentity not a ServiceIdentity.
   * @param  {boolean} [canLoad=false] - Pass true to allow loading an identity from
   *                                    the server if not found
   * @return {layer.Identity}
   */
  getIdentity(id, canLoad) {
    if (typeof id !== 'string') throw new Error(LayerError.dictionary.idParamRequired);
    if (!UserIdentity.isValidId(id) && !ServiceIdentity.isValidId(id)) {
      id = UserIdentity.prefixUUID + encodeURIComponent(id);
    }

    switch (Util.typeFromID(id)) {
      case 'identities':
        if (this._identitiesHash[id]) {
          return this._identitiesHash[id];
        } else if (canLoad) {
          return Identity.load(id, this);
        }
        break;
      case 'serviceidentities':
        if (this._serviceIdentitiesHash[id]) {
          return this._serviceIdentitiesHash[id];
        }
    }
    return null;
  }

  /**
   * Adds an identity to the client.
   *
   * Typically, you do not need to call this; the Identity constructor will call this.
   *
   * @method _addIdentity
   * @protected
   * @param  {layer.Identity} identity
   * @returns {layer.Client} this
   *
   * TODO: It should be possible to add an Identity whose userId is populated, but
   * other values are not yet loaded from the server.  Should add to _identitiesHash now
   * but trigger `identities:add` only when its got enough data to be renderable.
   */
  _addIdentity(identity) {
    const id = identity.id;
    switch (Util.typeFromID(id)) {
      case 'identities':
        if (!this._identitiesHash[id]) {
          // Register the Identity
          this._identitiesHash[id] = identity;
          this._triggerAsync('identities:add', { identities: [identity] });
        }
        break;
      case 'serviceidentities':
        if (!this._serviceIdentitiesHash[id]) {
          // Register the Identity
          this._serviceIdentitiesHash[id] = identity;
        }
        break;
    }
    return this;
  }

  /**
   * Removes an identity from the client.
   *
   * Typically, you do not need to call this; the following code
   * automatically calls _removeIdentity for you:
   *
   *      identity.destroy();
   *
   * @method _removeIdentity
   * @protected
   * @param  {layer.Identity} identity
   * @returns {layer.Client} this
   */
  _removeIdentity(identity) {
    // Insure we do not get any events, such as message:remove
    identity.off(null, null, this);

    const id = identity.id;
    switch (Util.typeFromID(id)) {
      case 'identities':
        if (this._identitiesHash[id]) {
          delete this._identitiesHash[id];
          this._triggerAsync('identities:remove', { identities: [identity] });
        }
        break;
      case 'serviceidentities':
        if (this._serviceIdentitiesHash[id]) {
          delete this._serviceIdentitiesHash[id];
        }
        break;
    }
    return this;
  }

  /**
   * Follow this user and get Full Identity, and websocket changes on Identity.
   *
   * @method followIdentity
   * @param  {string} id - Accepts full Layer ID (layer:///identities/frodo-the-dodo) or just the UserID (frodo-the-dodo).
   * @returns {layer.UserIdentity}
   */
  followIdentity(id) {
    if (!UserIdentity.isValidId(id)) {
      id = UserIdentity.prefixUUID + encodeURIComponent(id);
    }
    let identity = this.getIdentity(id);
    if (!identity) {
      identity = new UserIdentity({
        id,
        clientId: this.appId,
        userId: id.substring(20),
      });
    }
    identity.follow();
    return identity;
  }

  /**
   * Unfollow this user and get only Basic Identity, and no websocket changes on Identity.
   *
   * @method unfollowIdentity
   * @param  {string} id - Accepts full Layer ID (layer:///identities/frodo-the-dodo) or just the UserID (frodo-the-dodo).
   * @returns {layer.UserIdentity}
   */
  unfollowIdentity(id) {
    if (!UserIdentity.isValidId(id)) {
      id = UserIdentity.prefixUUID + encodeURIComponent(id);
    }
    let identity = this.getIdentity(id);
    if (!identity) {
      identity = new UserIdentity({
        id,
        clientId: this.appId,
        userId: id.substring(20),
      });
    }
    identity.unfollow();
    return identity;
  }

  /**
   * Takes as input an object id, and either calls getConversation() or getMessage() as needed.
   *
   * Will only get cached objects, will not get objects from the server.
   *
   * This is not a public method mostly so there's no ambiguity over using getXXX
   * or _getObject.  getXXX typically has an option to load the resource, which this
   * does not.
   *
   * @method _getObject
   * @protected
   * @param  {string} id - Message, Conversation or Query id
   * @return {layer.Message|layer.Conversation|layer.Query}
   */
  _getObject(id) {
    switch (Util.typeFromID(id)) {
      case 'messages':
      case 'announcements':
        return this.getMessage(id);
      case 'conversations':
        return this.getConversation(id);
      case 'queries':
        return this.getQuery(id);
      case 'identities':
      case 'serviceidentities':
        return this.getIdentity(id);
    }
    return null;
  }


  /**
   * Takes an object description from the server and either updates it (if cached)
   * or creates and caches it .
   *
   * @method _createObject
   * @protected
   * @param  {Object} obj - Plain javascript object representing a Message or Conversation
   */
  _createObject(obj) {
    const item = this._getObject(obj.id);
    if (item) {
      item._populateFromServer(obj);
      return item;
    } else {
      switch (Util.typeFromID(obj.id)) {
        case 'messages':
          return Message._createFromServer(obj, this);
        case 'announcements':
          return Announcement._createFromServer(obj, this);
        case 'conversations':
          return Conversation._createFromServer(obj, this);
        case 'identities':
          return UserIdentity._createFromServer(obj, this);
        case 'serviceidentities':
          return ServiceIdentity._createFromServer(obj, this);
      }
    }
  }

  /**
   * Merge events into smaller numbers of more complete events.
   *
   * Before any delayed triggers are fired, fold together all of the conversations:add
   * and conversations:remove events so that 100 conversations:add events can be fired as
   * a single event.
   *
   * @method _processDelayedTriggers
   * @private
   */
  _processDelayedTriggers() {
    if (this.isDestroyed) return;

    const addConversations = this._delayedTriggers.filter((evt) => evt[0] === 'conversations:add');
    const removeConversations = this._delayedTriggers.filter((evt) => evt[0] === 'conversations:remove');
    this._foldEvents(addConversations, 'conversations', this);
    this._foldEvents(removeConversations, 'conversations', this);

    const addMessages = this._delayedTriggers.filter((evt) => evt[0] === 'messages:add');
    const removeMessages = this._delayedTriggers.filter((evt) => evt[0] === 'messages:remove');

    this._foldEvents(addMessages, 'messages', this);
    this._foldEvents(removeMessages, 'messages', this);

    const addIdentities = this._delayedTriggers.filter((evt) => evt[0] === 'identities:add');
    const removeIdentities = this._delayedTriggers.filter((evt) => evt[0] === 'identities:remove');

    this._foldEvents(addIdentities, 'identities', this);
    this._foldEvents(removeIdentities, 'identities', this);

    super._processDelayedTriggers();
  }

  trigger(eventName, evt) {
    this._triggerLogger(eventName, evt);
    super.trigger(eventName, evt);
  }

  /**
   * Does logging on all triggered events.
   *
   * All logging is done at `debug` or `info` levels.
   *
   * @method _triggerLogger
   * @private
   */
  _triggerLogger(eventName, evt) {
    const infoEvents = [
      'conversations:add', 'conversations:remove', 'conversations:change',
      'messages:add', 'messages:remove', 'messages:change',
      'identities:add', 'identities:remove', 'identities:change',
      'challenge', 'ready',
    ];
    if (infoEvents.indexOf(eventName) !== -1) {
      if (evt && evt.isChange) {
        logger.info(`Client Event: ${eventName} ${evt.changes.map(change => change.property).join(', ')}`);
      } else {
        let text = '';
        if (evt) {
          if (evt.message) text = evt.message.id;
          if (evt.messages) text = evt.messages.length + ' messages';
          if (evt.conversation) text = evt.conversation.id;
          if (evt.conversations) text = evt.conversations.length + ' conversations';
        }
        logger.info(`Client Event: ${eventName} ${text}`);
      }
      if (evt) logger.debug(evt);
    } else {
      logger.debug(eventName, evt);
    }
  }

  /**
   * Searches locally cached conversations for a matching conversation.
   *
   * Iterates over conversations calling a matching function until
   * the conversation is found or all conversations tested.
   *
   *      var c = client.findConversation(function(conversation) {
   *          if (conversation.participants.indexOf('a') != -1) return true;
   *      });
   *
   * @method findCachedConversation
   * @param  {Function} f - Function to call until we find a match
   * @param  {layer.Conversation} f.conversation - A conversation to test
   * @param  {boolean} f.return - Return true if the conversation is a match
   * @param  {Object} [context] - Optional context for the *this* object
   * @return {layer.Conversation}
   *
   * @deprecated
   * This should be replaced by iterating over your layer.Query data.
   */
  findCachedConversation(func, context) {
    const test = context ? func.bind(context) : func;
    const list = Object.keys(this._conversationsHash);
    const len = list.length;
    for (let index = 0; index < len; index++) {
      const key = list[index];
      const conversation = this._conversationsHash[key];
      if (test(conversation, index)) return conversation;
    }
  }

  /**
   * If the session has been reset, dump all data.
   *
   * @method _resetSession
   * @private
   */
  _resetSession() {
    this._cleanup();
    this._conversationsHash = {};
    this._messagesHash = {};
    this._queriesHash = {};
    this._identitiesHash = {};
    this._serviceIdentitiesHash = {};
    return super._resetSession();
  }



  /**
   * This method is recommended way to create a Conversation.
   *
   * There are a few ways to invoke it; note that the default behavior is to create a Distinct Conversation
   * unless otherwise stated via the layer.Conversation.distinct property.
   *
   *         client.createConversation(['a', 'b']);
   *
   *         client.createConversation({participants: ['a', 'b']});
   *
   *         client.createConversation({
   *             participants: ['a', 'b'],
   *             distinct: false
   *         });
   *
   *         client.createConversation({
   *             participants: ['a', 'b'],
   *             metadata: {
   *                 title: 'I am a title'
   *             }
   *         });
   *
   * If you try to create a Distinct Conversation that already exists,
   * you will get back an existing Conversation, and any requested metadata
   * will NOT be set; you will get whatever metadata the matching Conversation
   * already had.
   *
   * The default value for distinct is `true`.
   *
   * Whether the Conversation already exists or not, a 'conversations:sent' event
   * will be triggered asynchronously and the Conversation object will be ready
   * at that time.  Further, the event will provide details on the result:
   *
   *       var conversation = client.createConversation(['a', 'b']);
   *       conversation.on('conversations:sent', function(evt) {
   *           switch(evt.result) {
   *               case Conversation.CREATED:
   *                   alert(conversation.id + ' was created');
   *                   break;
   *               case Conversation.FOUND:
   *                   alert(conversation.id + ' was found');
   *                   break;
   *               case Conversation.FOUND_WITHOUT_REQUESTED_METADATA:
   *                   alert(conversation.id + ' was found but it already has a title so your requested title was not set');
   *                   break;
   *            }
   *       });
   *
   * @method createConversation
   * @param  {Object/string[]} options Either an array of participants,
   *                                  or an object with parameters to pass to
   *                                  Conversation's constructor
   * @param {Boolean} [options.distinct=true] Is this a distinct Converation?
   * @param {Object} [options.metadata={}] Metadata for your Conversation
   * @return {layer.Conversation}
   */
  createConversation(options) {
    let opts;
    if (Array.isArray(options)) {
      opts = {
        participants: options,
      };
    } else {
      opts = options;
    }
    if (!('distinct' in opts)) opts.distinct = true;
    opts.client = this;
    return Conversation.create(opts);
  }

  /**
   * Retrieve the query by query id.
   *
   * Useful for finding a Query when you only have the ID
   *
   * @method getQuery
   * @param  {string} id              - layer:///messages/uuid
   * @return {layer.Query}
   */
  getQuery(id) {
    if (typeof id !== 'string') throw new Error(LayerError.dictionary.idParamRequired);

    if (this._queriesHash[id]) {
      return this._queriesHash[id];
    }
    return null;
  }

  /**
   * There are two options to create a new layer.Query instance.
   *
   * The direct way:
   *
   *     var query = client.createQuery({
   *         model: layer.Query.Message,
   *         predicate: 'conversation.id = '' + conv.id + ''',
   *         paginationWindow: 50
   *     });
   *
   * A Builder approach that allows for a simpler syntax:
   *
   *     var qBuilder = QueryBuilder
   *      .messages()
   *      .forConversation('layer:///conversations/ffffffff-ffff-ffff-ffff-ffffffffffff')
   *      .paginationWindow(100);
   *     var query = client.createQuery(qBuilder);
   *
   * @method createQuery
   * @param  {layer.QueryBuilder|Object} options - Either a layer.QueryBuilder instance, or parameters for the layer.Query constructor
   * @return {layer.Query}
   */
  createQuery(options) {
    let query;
    if (typeof options.build === 'function') {
      query = new Query(this, options);
    } else {
      options.client = this;
      query = new Query(options);
    }
    this._addQuery(query);
    return query;
  }

  /**
   * Register the layer.Query.
   *
   * @method _addQuery
   * @private
   * @param  {layer.Query} query
   */
  _addQuery(query) {
    this._queriesHash[query.id] = query;
  }

  /**
   * Deregister the layer.Query.
   *
   * @method _removeQuery
   * @private
   * @param  {layer.Query} query [description]
   */
  _removeQuery(query) {
    if (query) {
      delete this._queriesHash[query.id];
      if (!this._inCleanup) {
        const data = query.data
          .map(obj => this._getObject(obj.id))
          .filter(obj => obj);
        this._checkAndPurgeCache(data);
      }
      this.off(null, null, query);
    }
  }

  /**
   * Check to see if the specified objects can safely be removed from cache.
   *
   * Removes from cache if an object is not part of any Query's result set.
   *
   * @method _checkAndPurgeCache
   * @private
   * @param  {layer.Root[]} objects - Array of Messages or Conversations
   */
  _checkAndPurgeCache(objects) {
    objects.forEach(obj => {
      if (!obj.isDestroyed && !this._isCachedObject(obj)) {
        if (obj instanceof Root === false) obj = this._getObject(obj.id);
        obj.destroy();
      }
    });
  }

  /**
   * Schedules _runScheduledCheckAndPurgeCache if needed, and adds this object
   * to the list of objects it will validate for uncaching.
   *
   * Note that any object that does not exist on the server (!isSaved()) is an object that the
   * app created and can only be purged by the app and not by the SDK.  Once its been
   * saved, and can be reloaded from the server when needed, its subject to standard caching.
   *
   * @method _scheduleCheckAndPurgeCache
   * @private
   * @param {layer.Root}
   */
  _scheduleCheckAndPurgeCache(object) {
    if (object.isSaved()) {
      if (this._scheduleCheckAndPurgeCacheAt < Date.now()) {
        this._scheduleCheckAndPurgeCacheAt = Date.now() + Client.CACHE_PURGE_INTERVAL;
        setTimeout(() => this._runScheduledCheckAndPurgeCache(), Client.CACHE_PURGE_INTERVAL);
      }
      this._scheduleCheckAndPurgeCacheItems.push(object);
    }
  }

  /**
   * Calls _checkAndPurgeCache on accumulated objects and resets its state
   */
  _runScheduledCheckAndPurgeCache() {
    const list = this._scheduleCheckAndPurgeCacheItems;
    this._scheduleCheckAndPurgeCacheItems = [];
    this._checkAndPurgeCache(list);
    this._scheduleCheckAndPurgeCacheAt = 0;
  }

  /**
   * Returns true if the specified object should continue to be part of the cache.
   *
   * Result is based on whether the object is part of the data for a Query.
   *
   * @method _isCachedObject
   * @private
   * @param  {layer.Root} obj - A Message or Conversation Instance
   * @return {Boolean}
   */
  _isCachedObject(obj) {
    const list = Object.keys(this._queriesHash);
    for (let i = 0; i < list.length; i++) {
      const query = this._queriesHash[list[i]];
      if (query._getItem(obj.id)) return true;
    }
  }

  /**
   * On restoring a connection, determine what steps need to be taken to update our data.
   *
   * A reset boolean property is passed; set based on  layer.ClientAuthenticator.ResetAfterOfflineDuration.
   *
   * Note it is possible for an application to have logic that causes queries to be created/destroyed
   * as a side-effect of layer.Query.reset destroying all data. So we must test to see if queries exist.
   *
   * @method _connectionRestored
   * @private
   * @param {boolean} reset - Should the session reset/reload all data or attempt to resume where it left off?
   */
  _connectionRestored(evt) {
    if (evt.reset) {
      logger.debug('Client Connection Restored; Resetting all Queries');
      Object.keys(this._queriesHash).forEach(id => {
        const query = this._queriesHash[id];
        if (query) query.reset();
      });
    }
  }

  /**
   * Remove the specified object from cache
   *
   * @method _removeObject
   * @private
   * @param  {layer.Root}  obj - A Message or Conversation Instance
   */
  _removeObject(obj) {
    if (obj) obj.destroy();
  }

  /**
   * Creates a layer.TypingIndicators.TypingListener instance
   * bound to the specified dom node.
   *
   *      var typingListener = client.createTypingListener(document.getElementById('myTextBox'));
   *      typingListener.setConversation(mySelectedConversation);
   *
   * Use this method to instantiate a listener, and call
   * layer.TypingIndicators.TypingListener.setConversation every time you want to change which Conversation
   * it reports your user is typing into.
   *
   * @method createTypingListener
   * @param  {HTMLElement} inputNode - Text input to watch for keystrokes
   * @return {layer.TypingIndicators.TypingListener}
   */
  createTypingListener(inputNode) {
    const TypingListener = require('./typing-indicators/typing-listener');
    return new TypingListener({
      clientId: this.appId,
      input: inputNode,
    });
  }

  /**
   * Creates a layer.TypingIndicators.TypingPublisher.
   *
   * The TypingPublisher lets you manage your Typing Indicators without using
   * the layer.TypingIndicators.TypingListener.
   *
   *      var typingPublisher = client.createTypingPublisher();
   *      typingPublisher.setConversation(mySelectedConversation);
   *      typingPublisher.setState(layer.TypingIndicators.STARTED);
   *
   * Use this method to instantiate a listener, and call
   * layer.TypingIndicators.TypingPublisher.setConversation every time you want to change which Conversation
   * it reports your user is typing into.
   *
   * Use layer.TypingIndicators.TypingPublisher.setState to inform other users of your current state.
   * Note that the `STARTED` state only lasts for 2.5 seconds, so you
   * must repeatedly call setState for as long as this state should continue.
   * This is typically done by simply calling it every time a user hits
   * a key.
   *
   * @method createTypingPublisher
   * @return {layer.TypingIndicators.TypingPublisher}
   */
  createTypingPublisher() {
    const TypingPublisher = require('./typing-indicators/typing-publisher');
    return new TypingPublisher({
      clientId: this.appId,
    });
  }

  /**
   * Accessor for getting a Client by appId.
   *
   * Most apps will only have one client,
   * and will not need this method.
   *
   * @method getClient
   * @static
   * @param  {string} appId
   * @return {layer.Client}
   */
  static getClient(appId) {
    return ClientRegistry.get(appId);
  }

  static destroyAllClients() {
    ClientRegistry.getAll().forEach(client => client.destroy());
  }

  /*
   * Registers a plugin which can add capabilities to the Client.
   *
   * Capabilities must be triggered by Events/Event Listeners.
   *
   * This concept is a bit premature and unused/untested...
   * As implemented, it provides for a plugin that will be
   * instantiated by the Client and passed the Client as its parameter.
   * This allows for a library of plugins that can be shared among
   * different companies/projects but that are outside of the core
   * app logic.
   *
   *      // Define the plugin
   *      function MyPlugin(client) {
   *          this.client = client;
   *          client.on('messages:add', this.onMessagesAdd, this);
   *      }
   *
   *      MyPlugin.prototype.onMessagesAdd = function(event) {
   *          var messages = event.messages;
   *          alert('You now have ' + messages.length  + ' messages');
   *      }
   *
   *      // Register the Plugin
   *      Client.registerPlugin('myPlugin34', MyPlugin);
   *
   *      var client = new Client({appId: 'layer:///apps/staging/uuid'});
   *
   *      // Trigger the plugin's behavior
   *      client.myPlugin34.addMessages({messages:[]});
   *
   * @method registerPlugin
   * @static
   * @param  {string} name     [description]
   * @param  {Function} classDef [description]
   */
  static registerPlugin(name, classDef) {
    Client.plugins[name] = classDef;
  }

}

/**
 * Hash of layer.Conversation objects for quick lookup by id
 *
 * @private
 * @property {Object}
 */
Client.prototype._conversationsHash = null;

/**
 * Hash of layer.Message objects for quick lookup by id
 *
 * @private
 * @type {Object}
 */
Client.prototype._messagesHash = null;

/**
 * Hash of layer.Query objects for quick lookup by id
 *
 * @private
 * @type {Object}
 */
Client.prototype._queriesHash = null;

/**
 * Array of items to be checked to see if they can be uncached.
 *
 * @private
 * @type {layer.Root[]}
 */
Client.prototype._scheduleCheckAndPurgeCacheItems = null;

/**
 * Time that the next call to _runCheckAndPurgeCache() is scheduled for in ms since 1970.
 *
 * @private
 * @type {number}
 */
Client.prototype._scheduleCheckAndPurgeCacheAt = 0;


/**
 * Any Conversation or Message that is part of a Query's results are kept in memory for as long as it
 * remains in that Query.  However, when a websocket event delivers new Messages and Conversations that
 * are NOT part of a Query, how long should they stick around in memory?  Why have them stick around?
 * Perhaps an app wants to post a notification of a new Message or Conversation... and wants to keep
 * the object local for a little while.  Default is 10 minutes before checking to see if
 * the object is part of a Query or can be uncached.  Value is in miliseconds.
 * @static
 * @type {number}
 */
Client.CACHE_PURGE_INTERVAL = 10 * 60 * 1000;

Client._ignoredEvents = [
  'conversations:loaded',
  'conversations:loaded-error',
];

Client._supportedEvents = [

  /**
   * One or more layer.Conversation objects have been added to the client.
   *
   * They may have been added via the websocket, or via the user creating
   * a new Conversation locally.
   *
   *      client.on('conversations:add', function(evt) {
   *          evt.conversations.forEach(function(conversation) {
   *              myView.addConversation(conversation);
   *          });
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Conversation[]} evt.conversations - Array of conversations added
   */
  'conversations:add',

  /**
   * One or more layer.Conversation objects have been removed.
   *
   * A removed Conversation is not necessarily deleted, its just
   * no longer being held in local memory.
   *
   * Note that typically you will want the conversations:delete event
   * rather than conversations:remove.
   *
   *      client.on('conversations:remove', function(evt) {
   *          evt.conversations.forEach(function(conversation) {
   *              myView.removeConversation(conversation);
   *          });
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Conversation[]} evt.conversations - Array of conversations removed
   */
  'conversations:remove',

  /**
   * The conversation is now on the server.
   *
   * Called after creating the conversation
   * on the server.  The Result property is one of:
   *
   * * layer.Conversation.CREATED: A new Conversation has been created
   * * layer.Conversation.FOUND: A matching Distinct Conversation has been found
   * * layer.Conversation.FOUND_WITHOUT_REQUESTED_METADATA: A matching Distinct Conversation has been found
   *                       but note that the metadata is NOT what you requested.
   *
   * All of these results will also mean that the updated property values have been
   * copied into your Conversation object.  That means your metadata property may no
   * longer be its initial value; it will be the value found on the server.
   *
   *      client.on('conversations:sent', function(evt) {
   *          switch(evt.result) {
   *              case Conversation.CREATED:
   *                  alert(evt.target.id + ' Created!');
   *                  break;
   *              case Conversation.FOUND:
   *                  alert(evt.target.id + ' Found!');
   *                  break;
   *              case Conversation.FOUND_WITHOUT_REQUESTED_METADATA:
   *                  alert(evt.target.id + ' Found, but does not have the requested metadata!');
   *                  break;
   *          }
   *      });
   *
   * @event
   * @param {layer.LayerEvent} event
   * @param {string} event.result
   * @param {layer.Conversation} target
   */
  'conversations:sent',

  /**
   * A conversation failed to load or create on the server.
   *
   *      client.on('conversations:sent-error', function(evt) {
   *          alert(evt.data.message);
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.LayerError} evt.data
   * @param {layer.Conversation} target
   */
  'conversations:sent-error',

  /**
   * A conversation had a change in its properties.
   *
   * This change may have been delivered from a remote user
   * or as a result of a local operation.
   *
   *      client.on('conversations:change', function(evt) {
   *          var metadataChanges = evt.getChangesFor('metadata');
   *          var participantChanges = evt.getChangesFor('participants');
   *          if (metadataChanges.length) {
   *              myView.renderTitle(evt.target.metadata.title);
   *          }
   *          if (participantChanges.length) {
   *              myView.renderParticipants(evt.target.participants);
   *          }
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Conversation} evt.target
   * @param {Object[]} evt.changes
   * @param {Mixed} evt.changes.newValue
   * @param {Mixed} evt.changes.oldValue
   * @param {string} evt.changes.property - Name of the property that has changed
   */
  'conversations:change',

  /**
   * A call to layer.Conversation.load has completed successfully
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Conversation} evt.target
   */
  'conversations:loaded',

  /**
   * A new message has been received for which a notification may be suitable.
   * This event is triggered for messages that are:
   *
   * 1. Added via websocket rather than other IO
   * 2. Not yet been marked as read
   * 3. Not sent by this user
   *
          client.on('messages:notify', function(evt) {
              myNotify(evt.message);
          })
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.Message
   */
  'messages:notify',

  /**
   * Messages have been added to a conversation.
   *
   * This event is triggered on
   *
   * * creating/sending a new message
   * * Receiving a new Message via websocket
   * * Querying/downloading a set of Messages
   *
          client.on('messages:add', function(evt) {
              evt.messages.forEach(function(message) {
                  myView.addMessage(message);
              });
          });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message[]} evt.messages
   */
  'messages:add',

  /**
   * A message has been removed from a conversation.
   *
   * A removed Message is not necessarily deleted,
   * just no longer being held in memory.
   *
   * Note that typically you will want the messages:delete event
   * rather than messages:remove.
   *
   *      client.on('messages:remove', function(evt) {
   *          evt.messages.forEach(function(message) {
   *              myView.removeMessage(message);
   *          });
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.message
   */
  'messages:remove',

  /**
   * A message has been sent.
   *
   *      client.on('messages:sent', function(evt) {
   *          alert(evt.target.getText() + ' has been sent');
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   */
  'messages:sent',

  /**
   * A message is about to be sent.
   *
   * Useful if you want to
   * add parts to the message before it goes out.
   *
   *      client.on('messages:sending', function(evt) {
   *          evt.target.addPart({
   *              mimeType: 'text/plain',
   *              body: 'this is just a test'
   *          });
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   */
  'messages:sending',

  /**
   * Server failed to receive a Message.
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.LayerError} evt.error
   */
  'messages:sent-error',

  /**
   * A message has had a change in its properties.
   *
   * This change may have been delivered from a remote user
   * or as a result of a local operation.
   *
   *      client.on('messages:change', function(evt) {
   *          var recpientStatusChanges = evt.getChangesFor('recipientStatus');
   *          if (recpientStatusChanges.length) {
   *              myView.renderStatus(evt.target);
   *          }
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   * @param {Object[]} evt.changes
   * @param {Mixed} evt.changes.newValue
   * @param {Mixed} evt.changes.oldValue
   * @param {string} evt.changes.property - Name of the property that has changed
   */
  'messages:change',


  /**
   * A call to layer.Message.load has completed successfully
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   */
  'messages:loaded',

  /**
   * A Conversation has been deleted from the server.
   *
   * Caused by either a successful call to layer.Conversation.delete() on the Conversation
   * or by a remote user.
   *
   *      client.on('conversations:delete', function(evt) {
   *          myView.removeConversation(evt.target);
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Conversation} evt.target
   */
  'conversations:delete',

  /**
   * A Message has been deleted from the server.
   *
   * Caused by either a successful call to layer.Message.delete() on the Message
   * or by a remote user.
   *
   *      client.on('messages:delete', function(evt) {
   *          myView.removeMessage(evt.target);
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   */
  'messages:delete',

  /**
   * A call to layer.Identity.load has completed successfully
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   */
  'identities:loaded',

  /**
   * An Identity has had a change in its properties.
   *
   * Changes occur when new data arrives from the server.
   *
   *      client.on('identities:change', function(evt) {
   *          var displayNameChanges = evt.getChangesFor('displayName');
   *          if (displayNameChanges.length) {
   *              myView.renderStatus(evt.target);
   *          }
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.Message} evt.target
   * @param {Object[]} evt.changes
   * @param {Mixed} evt.changes.newValue
   * @param {Mixed} evt.changes.oldValue
   * @param {string} evt.changes.property - Name of the property that has changed
   */
  'identities:change',

  /**
   * Identities have been added to the Client.
   *
   * This event is triggered whenever a new layer.UserIdentity (Full identity or not)
   * has been received by the Client. layer.ServiceIdentity does not trigger this event.
   *
          client.on('identities:add', function(evt) {
              evt.identities.forEach(function(identity) {
                  myView.addIdentity(identity);
              });
          });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.UserIdentity[]} evt.identities
   */
  'identities:add',

  /**
   * Identities have been removed from the Client.
   *
   * This does not typically occur.
   *
          client.on('identities:remove', function(evt) {
              evt.identities.forEach(function(identity) {
                  myView.addIdentity(identity);
              });
          });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.UserIdentity[]} evt.identities
   */
  'identities:remove',

  /**
   * An Identity has been unfollowed or deleted.
   *
   * We do not delete such Identities entirely from the Client as
   * there are still Messages from these Identities to be rendered,
   * but we do downgrade them from Full Identity to Basic Identity.
   * @event
   * @param {layer.LayerEvent} evt
   * @param {layer.UserIdentity} evt.target
   */
  'identities:unfollow',


  /**
   * A Typing Indicator state has changed.
   *
   * Either a change has been received
   * from the server, or a typing indicator state has expired.
   *
   *      client.on('typing-indicator-change', function(evt) {
   *          if (evt.conversationId === myConversationId) {
   *              alert(evt.typing.join(', ') + ' are typing');
   *              alert(evt.paused.join(', ') + ' are paused');
   *          }
   *      });
   *
   * @event
   * @param {layer.LayerEvent} evt
   * @param {string} conversationId - ID of the Conversation users are typing into
   * @param {string[]} typing - Array of user IDs who are currently typing
   * @param {string[]} paused - Array of user IDs who are currently paused;
   *                            A paused user still has text in their text box.
   */
  'typing-indicator-change',


].concat(ClientAuth._supportedEvents);

Client.plugins = {};


Root.initClass.apply(Client, [Client, 'Client']);
module.exports = Client;
