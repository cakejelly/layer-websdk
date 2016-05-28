/**
 * A Conversation object represents a dialog amongst a set
 * of participants.
 *
 * Create a Conversation using the client:
 *
 *      var conversation = client.createConversation({
 *          participants: ['a','b'],
 *          distinct: true
 *      });
 *
 * In addition, there is a shortcut method for creating
 * a conversation, which will default to creating a Distinct
 * Conversation.
 *
 *      var conversation = client.createConversation(['a','b']);
 *
 * NOTE:   Do not create a conversation with new layer.Conversation(...),
 *         This will fail to handle the distinct property short of going to the server for evaluation.
 *
 * NOTE:   Creating a Conversation is a local action.  A Conversation will not be
 *         sent to the server until either:
 *
 * 1. A message is sent on that Conversation
 * 2. `Conversation.send()` is called (not recommended as mobile clients
 *    expect at least one layer.Message in a Conversation)
 *
 * Key methods, events and properties for getting started:
 *
 * Properties:
 *
 * * layer.Conversation.id: this property is worth being familiar with; it identifies the
 *   Conversation and can be used in `client.getConversation(id)` to retrieve it.
 * * layer.Conversation.internalId: This property makes for a handy unique ID for use in dom nodes;
 *   gaurenteed not to change during this session.
 * * layer.Conversation.lastMessage: This property makes it easy to show info about the most recent Message
 *    when rendering a list of Conversations.
 * * layer.Conversation.metadata: Custom data for your Conversation; commonly used to store a 'title' property
 *    to name your Conversation.
 *
 * Methods:
 *
 * * layer.Conversation.addParticipants and layer.Conversation.removeParticipants: Change the participants of the Conversation
 * * layer.Conversation.setMetadataProperties: Set metadata.title to 'My Conversation with Layer Support' (uh oh)
 * * layer.Conversation.on() and layer.Conversation.off(): event listeners built on top of the `backbone-events-standalone` npm project
 * * layer.Conversation.leave() to leave the Conversation
 *
 * Events:
 *
 * * `conversations:change`: Useful for observing changes to participants and metadata
 *   and updating rendering of your open Conversation
 *
 * Finally, to access a list of Messages in a Conversation, see layer.Query.
 *
 * @class  layer.Conversation
 * @extends layer.Syncable
 * @author  Michael Kantor
 */

const Syncable = require('./syncable');
const Message = require('./message');
const LayerError = require('./layer-error');
const Util = require('./client-utils');
const Constants = require('./const');
const Root = require('./root');
const LayerEvent = require('./layer-event');
const logger = require('./logger');

class Conversation extends Syncable {

  /**
   * Create a new conversation.
   *
   * The static `layer.Conversation.create()` method
   * will correctly lookup distinct Conversations and
   * return them; `new layer.Conversation()` will not.
   *
   * Developers should use `layer.Conversation.create()`.
   *
   * @method constructor
   * @protected
   * @param  {Object} options
   * @param {string[]} options.participants - Array of participant ids
   * @param {boolean} [options.distinct=true] - Is the conversation distinct
   * @param {Object} [options.metadata] - An object containing Conversation Metadata.
   * @return {layer.Conversation}
   */
  constructor(options = {}) {
    // Setup default values
    if (!options.participants) options.participants = [];
    if (!options.metadata) options.metadata = {};

    // Make sure the ID from handle fromServer parameter is used by the Root.constructor
    if (options.fromServer) options.id = options.fromServer.id;

    // Make sure we have an clientId property
    if (options.client) options.clientId = options.client.appId;

    super(options);


    this.isInitializing = true;
    const client = this.getClient();

    // If the options contains a full server definition of the object,
    // copy it in with _populateFromServer; this will add the Conversation
    // to the Client as well.
    if (options && options.fromServer) {
      this._populateFromServer(options.fromServer);
    }

    // Setup participants
    else if (client && this.participants.indexOf(client.user.userId) === -1) {
      this.participants.push(client.user.userId);
    }

    if (client) client._addConversation(this);
    this.isInitializing = false;
  }

  /**
   * Destroy the local copy of this Conversation, cleaning up all resources
   * it consumes.
   *
   * @method destroy
   */
  destroy() {
    this.lastMessage = null;

    // Client fires 'conversations:remove' and then removes the Conversation.
    if (this.clientId) this.getClient()._removeConversation(this);

    super.destroy();

    this.participants = null;
    this.metadata = null;
  }

  /**
   * Create this Conversation on the server.
   *
   * On completion, this instance will receive
   * an id, url and createdAt.  It may also receive metadata
   * if there was a FOUND_WITHOUT_REQUESTED_METADATA result.
   *
   * Note that the optional Message parameter should NOT be used except
   * by the layer.Message class itself.
   *
   * Note that recommended practice is to send the Conversation by sending a Message in the Conversation,
   * and NOT by calling Conversation.send.
   *
   *      client.createConversation({
   *          participants: ['a', 'b'],
   *          distinct: false
   *      })
   *      .send()
   *      .on('conversations:sent', function(evt) {
   *          alert('Done');
   *      });
   *
   * @method send
   * @param {layer.Message} [message] Tells the Conversation what its last_message will be
   * @return {layer.Conversation} this
   */
  send(message) {
    const client = this.getClient();
    if (!client) throw new Error(LayerError.dictionary.clientMissing);

    // If this is part of a create({distinct:true}).send() call where
    // the distinct conversation was found, just trigger the cached event and exit
    if (this._sendDistinctEvent) return this._handleLocalDistinctConversation();

    // If a message is passed in, then that message is being sent, and is our
    // new lastMessage (until the websocket tells us otherwise)
    if (message) {
      // Setting a position is required if its going to get sorted correctly by query.
      // The correct position will be written by _populateFromServer when the object
      // is returned from the server.  We increment the position by the time since the prior lastMessage was sent
      // so that if multiple tabs are sending messages and writing them to indexedDB, they will have positions in correct chronological order.
      // WARNING: The query will NOT be resorted using the server's position value.
      let position;
      if (this.lastMessage) {
        position = this.lastMessage.position + Date.now() - this.lastMessage.sentAt.getTime();
        if (position === this.lastMessage.position) position++;
      } else {
        position = 0;
      }
      message.position = position;
      this.lastMessage = message;
    }

    // If the Conversation is already on the server, don't send.
    if (this.syncState !== Constants.SYNC_STATE.NEW) return this;

    // Make sure this user is a participant (server does this for us, but
    // this insures the local copy is correct until we get a response from
    // the server
    if (this.participants.indexOf(client.user.userId) === -1) {
      this.participants.push(client.user.userId);
    }

    // If there is only one participant, its client.user.userId.  Not enough
    // for us to have a good Conversation on the server.  Abort.
    if (this.participants.length === 1) {
      throw new Error(LayerError.dictionary.moreParticipantsRequired);
    }

    this.createdAt = new Date();

    // Update the syncState
    this._setSyncing();

    client.sendSocketRequest({
      method: 'POST',
      body: {}, // see _getSendData
      sync: {
        depends: this.id,
        target: this.id,
      },
    }, (result) => this._createResult(result));
    return this;
  }

  /**
   * Handles the case where a Distinct Create Conversation found a local match.
   *
   * When an app calls client.createConversation([...])
   * and requests a Distinct Conversation (default setting),
   * and the Conversation already exists, what do we do to help
   * them access it?
   *
   *      client.createConversation(["fred"]).on("conversations:sent", function(evt) {
   *        render();
   *      });
   *
   * Under normal conditions, calling `c.send()` on a matching distinct Conversation
   * would either throw an error or just be a no-op.  We use this method to trigger
   * the expected "conversations:sent" event even though its already been sent and
   * we did nothing.  Use the evt.result property if you want to know whether the
   * result was a new conversation or matching one.
   *
   * @method _handleLocalDistinctConversation
   * @private
   */
  _handleLocalDistinctConversation() {
    const evt = this._sendDistinctEvent;
    this._sendDistinctEvent = null;

    // delay so there is time to setup an event listener on this conversation
    this._triggerAsync('conversations:sent', evt);
    return this;
  }


  /**
   * Gets the data for a Create request.
   *
   * The layer.SyncManager needs a callback to create the Conversation as it
   * looks NOW, not back when `send()` was called.  This method is called
   * by the layer.SyncManager to populate the POST data of the call.
   *
   * @method _getSendData
   * @private
   * @return {Object} Websocket data for the request
   */
  _getSendData(data) {
    const isMetadataEmpty = Util.isEmpty(this.metadata);
    return {
      method: 'Conversation.create',
      data: {
        participants: this.participants,
        distinct: this.distinct,
        metadata: isMetadataEmpty ? null : this.metadata,
        id: this.id,
      },
    };
  }

  /**
   * Process result of send method.
   *
   * Note that we use _triggerAsync so that
   * events reporting changes to the layer.Conversation.id can
   * be applied before reporting on it being sent.
   *
   * Example: Query will now have the resolved Distinct IDs rather than the proposed ID
   * when this event is triggered.
   *
   * @method _createResult
   * @private
   * @param  {Object} result
   */
  _createResult({ success, data }) {
    if (this.isDestroyed) return;
    if (success) {
      this._createSuccess(data);
    } else if (data.id === 'conflict') {
      this._populateFromServer(data.data);
      this._triggerAsync('conversations:sent', {
        result: Conversation.FOUND_WITHOUT_REQUESTED_METADATA,
      });
    } else {
      this.trigger('conversations:sent-error', { error: data });
      this.destroy();
    }
  }

  /**
   * Process the successful result of a create call
   *
   * @method _createSuccess
   * @private
   * @param  {Object} data Server description of Conversation
   */
  _createSuccess(data) {
    this._populateFromServer(data);
    if (!this.distinct) {
      this._triggerAsync('conversations:sent', {
        result: Conversation.CREATED,
      });
    } else {
      // Currently the websocket does not tell us if its
      // returning an existing Conversation.  So guess...
      // if there is no lastMessage, then most likely, there was
      // no existing Conversation.  Sadly, API-834; last_message is currently
      // always null.
      this._triggerAsync('conversations:sent', {
        result: !this.lastMessage ? Conversation.CREATED : Conversation.FOUND,
      });
    }
  }

  /**
   * Populates this instance using server-data.
   *
   * Side effects add this to the Client.
   *
   * @method _populateFromServer
   * @private
   * @param  {Object} conversation - Server representation of the conversation
   */
  _populateFromServer(conversation) {
    const client = this.getClient();

    // Disable events if creating a new Conversation
    // We still want property change events for anything that DOES change
    this._disableEvents = (this.syncState === Constants.SYNC_STATE.NEW);

    this._setSynced();

    const id = this.id;
    this.id = conversation.id;

    // IDs change if the server returns a matching Distinct Conversation
    if (id !== this.id) {
      client._updateConversationId(this, id);
      this._triggerAsync('conversations:change', {
        oldValue: id,
        newValue: this.id,
        property: 'id',
      });
    }

    this.url = conversation.url;
    this.participants = conversation.participants;
    this.distinct = conversation.distinct;
    this.createdAt = new Date(conversation.created_at);
    this.metadata = conversation.metadata;
    this.unreadCount = conversation.unread_message_count;
    this.isCurrentParticipant = this.participants.indexOf(client.user.userId) !== -1;

    client._addConversation(this);


    if (conversation.last_message) {
      this.lastMessage = client._createObject(conversation.last_message);
    } else {
      this.lastMessage = null;
    }

    this._disableEvents = false;
  }


  /**
   * Add an array of participant ids to the conversation.
   *
   *      conversation.addParticipants(['a', 'b']);
   *
   * New participants will immediately show up in the Conversation,
   * but may not have synced with the server yet.
   *
   * TODO WEB-967: Roll participants back on getting a server error
   *
   * @method addParticipants
   * @param  {string[]} participants - Array of participant ids
   * @returns {layer.Conversation} this
   */
  addParticipants(participants) {
    // Only add those that aren't already in the list.
    const adding = participants.filter(participant => this.participants.indexOf(participant) === -1);
    this._patchParticipants({ add: adding, remove: [] });
    return this;
  }

  /**
   * Removes an array of participant ids from the conversation.
   *
   *      conversation.removeParticipants(['a', 'b']);
   *
   * Removed participants will immediately be removed from this Conversation,
   * but may not have synced with the server yet.
   *
   * Throws error if you attempt to remove ALL participants.
   *
   * TODO  WEB-967: Roll participants back on getting a server error
   *
   * @method removeParticipants
   * @param  {string[]} participants - Array of participant ids
   * @returns {layer.Conversation} this
   */
  removeParticipants(participants) {
    const currentParticipants = this.participants.concat([]).sort();
    const removing = participants.filter(participant => this.participants.indexOf(participant) !== -1).sort();
    if (JSON.stringify(currentParticipants) === JSON.stringify(removing)) {
      throw new Error(LayerError.dictionary.moreParticipantsRequired);
    }
    this._patchParticipants({ add: [], remove: removing });
    return this;
  }

  /**
   * Replaces all participants with a new array of of participant ids.
   *
   *      conversation.replaceParticipants(['a', 'b']);
   *
   * Changed participants will immediately show up in the Conversation,
   * but may not have synced with the server yet.
   *
   * TODO WEB-967: Roll participants back on getting a server error
   *
   * @method replaceParticipants
   * @param  {string[]} participants - Array of participant ids
   * @returns {layer.Conversation} this
   */
  replaceParticipants(participants) {
    if (!participants || !participants.length) {
      throw new Error(LayerError.dictionary.moreParticipantsRequired);
    }

    const change = this._getParticipantChange(participants, this.participants);
    this._patchParticipants(change);
    return this;
  }

  /**
   * Update the server with the new participant list.
   *
   * Executes as follows:
   *
   * 1. Updates the participants property of the local object
   * 2. Triggers a conversations:change event
   * 3. Submits a request to be sent to the server to update the server's object
   * 4. If there is an error, no errors are fired except by layer.SyncManager, but another
   *    conversations:change event is fired as the change is rolled back.
   *
   * @method _patchParticipants
   * @private
   * @param  {Object[]} operations - Array of JSON patch operation
   * @param  {Object} eventData - Data describing the change for use in an event
   */
  _patchParticipants(change) {
    this._applyParticipantChange(change);
    this.isCurrentParticipant = this.participants.indexOf(this.getClient().user.userId) !== -1;

    const ops = [];
    change.remove.forEach(id => {
      ops.push({
        operation: 'remove',
        property: 'participants',
        value: id,
      });
    });

    change.add.forEach(id => {
      ops.push({
        operation: 'add',
        property: 'participants',
        value: id,
      });
    });

    this._xhr({
      url: '',
      method: 'PATCH',
      data: JSON.stringify(ops),
      headers: {
        'content-type': 'application/vnd.layer-patch+json',
      },
    }, result => {
      if (!result.success) this._load();
    });
  }

  /**
   * Internally we use `{add: [], remove: []}` instead of LayerOperations.
   *
   * So control is handed off to this method to actually apply the changes
   * to the participants array.
   *
   * @method _applyParticipantChange
   * @private
   * @param  {Object} change
   * @param  {string[]} change.add - Array of userids to add
   * @param  {string[]} change.remove - Array of userids to remove
   */
  _applyParticipantChange(change) {
    const participants = [].concat(this.participants);
    change.add.forEach(id => {
      if (participants.indexOf(id) === -1) participants.push(id);
    });
    change.remove.forEach(id => {
      const index = participants.indexOf(id);
      if (index !== -1) participants.splice(index, 1);
    });
    this.participants = participants;
  }

  /**
   * Delete the Conversation from the server and removes this user as a participant.
   *
   * @method leave
   * @return null
   */
  leave() {
    if (this.isDestroyed) throw new Error(LayerError.dictionary.isDestroyed);
    this._delete(`mode=${Constants.DELETION_MODE.MY_DEVICES}&leave=true`);
  }

  /**
   * Delete the Conversation from the server, but deletion mode may cause user to remain a participant.
   *
   * This call will support various deletion modes.
   *
   * Deletion Modes:
   *
   * * layer.Constants.DELETION_MODE.ALL: This deletes the local copy immediately, and attempts to also
   *   delete the server's copy.
   * * layer.Constants.DELETION_MODE.MY_DEVICES: Deletes the local copy immediately, and attempts to delete it from all
   *   of my devices.  Other users retain access.
   * * true: For backwards compatibility thi is the same as ALL.
   *
   * MY_DEVICES does not remove this user as a participant.  That means a new Message on this Conversation will recreate the
   * Conversation for this user.  See layer.Conversation.leave() instead.
   *
   * Executes as follows:
   *
   * 1. Submits a request to be sent to the server to delete the server's object
   * 2. Delete's the local object
   * 3. If there is an error, no errors are fired except by layer.SyncManager, but the Conversation will be reloaded from the server,
   *    triggering a conversations:add event.
   *
   * @method delete
   * @param {number} deletionMode - layer.Constants.DELETION_MODE.ALL is only supported mode at this time
   * @return null
   */
  delete(mode) {
    if (this.isDestroyed) throw new Error(LayerError.dictionary.isDestroyed);

    let queryStr;
    switch (mode) {
      case Constants.DELETION_MODE.ALL:
      case true:
        queryStr = `mode=${Constants.DELETION_MODE.ALL}`;
        break;
      case Constants.DELETION_MODE.MY_DEVICES:
        queryStr = `mode=${Constants.DELETION_MODE.MY_DEVICES}&leave=false`;
        break;
      default:
        throw new Error(LayerError.dictionary.deletionModeUnsupported);
    }

    this._delete(queryStr);
  }

  /**
   * Delete the Conversation from the server (internal version).
   *
   * This version of Delete takes a Query String that is packaged up by
   * layer.Conversation.delete and layer.Conversation.leave.
   *
   * @method _delete
   * @private
   * @param {string} queryStr - Query string for the DELETE request
   */
  _delete(queryStr) {
    const id = this.id;
    const client = this.getClient();
    this._xhr({
      method: 'DELETE',
      url: '?' + queryStr,
    }, result => {
      if (!result.success && (!result.data || result.data.id !== 'not_found')) Conversation.load(id, client);
    });

    this._deleted();
    this.destroy();
  }

  _handleWebsocketDelete(data) {
    if (data.mode === Constants.DELETION_MODE.MY_DEVICES && data.from_position) {
      this.getClient()._purgeMessagesByPosition(this.id, data.from_position);
    } else {
      super._handleWebsocketDelete();
    }
  }

  /**
   * Create a new layer.Message instance within this conversation
   *
   *      var message = conversation.createMessage('hello');
   *
   *      var message = conversation.createMessage({
   *          parts: [new layer.MessagePart({
   *                      body: 'hello',
   *                      mimeType: 'text/plain'
   *                  })]
   *      });
   *
   * See layer.Message for more options for creating the message.
   *
   * @method createMessage
   * @param  {string|Object} options - If its a string, a MessagePart is created around that string.
   * @param {layer.MessagePart[]} options.parts - An array of MessageParts.  There is some tolerance for
   *                                               it not being an array, or for it being a string to be turned
   *                                               into a MessagePart.
   * @return {layer.Message}
   */
  createMessage(options = {}) {
    const messageConfig = (typeof options === 'string') ? {
      parts: [{ body: options, mimeType: 'text/plain' }],
    } : options;
    messageConfig.clientId = this.clientId;
    messageConfig.conversationId = this.id;

    return new Message(messageConfig);
  }

  /**
   * Accepts json-patch operations for modifying participants or metadata
   *
   * @method _handlePatchEvent
   * @private
   * @param  {Object[]} data - Array of operations
   */
  _handlePatchEvent(newValue, oldValue, paths) {
    // Certain types of __update handlers are disabled while values are being set by
    // layer patch parser because the difference between setting a value (triggers an event)
    // and change a property of a value (triggers only this callback) result in inconsistent
    // behaviors.  Enable them long enough to allow __update calls to be made
    this._inLayerParser = false;
    try {
      const events = this._disableEvents;
      this._disableEvents = false;
      if (paths[0].indexOf('metadata') === 0) {
        this.__updateMetadata(newValue, oldValue, paths);
      } else if (paths[0] === 'participants') {
        this.__updateParticipants(newValue, oldValue);
      }
      this._disableEvents = events;
    } catch (err) {
      // do nothing
    }
    this._inLayerParser = true;
  }

  /**
   * Given the oldValue and newValue for participants,
   * generate a list of whom was added and whom was removed.
   *
   * @method _getParticipantChange
   * @private
   * @param  {string[]} newValue
   * @param  {string[]} oldValue
   * @return {Object} Returns changes in the form of `{add: [...], remove: [...]}`
   */
  _getParticipantChange(newValue, oldValue) {
    const change = {};
    change.add = newValue.filter(participant => oldValue.indexOf(participant) === -1);
    change.remove = oldValue.filter(participant => newValue.indexOf(participant) === -1);
    return change;
  }



  /**
   * Updates specified metadata keys.
   *
   * Updates the local object's metadata and syncs the change to the server.
   *
   *      conversation.setMetadataProperties({
   *          'title': 'I am a title',
   *          'colors.background': 'red',
   *          'colors.text': {
   *              'fill': 'blue',
   *              'shadow': 'black'
   *           },
   *           'colors.title.fill': 'red'
   *      });
   *
   * Use setMetadataProperties to specify the path to a property, and a new value for that property.
   * Multiple properties can be changed this way.  Whatever value was there before is
   * replaced with the new value; so in the above example, whatever other keys may have
   * existed under `colors.text` have been replaced by the new object `{fill: 'blue', shadow: 'black'}`.
   *
   * Note also that only string and subobjects are accepted as values.
   *
   * Keys with '.' will update a field of an object (and create an object if it wasn't there):
   *
   * Initial metadata: {}
   *
   *      conversation.setMetadataProperties({
   *          'colors.background': 'red',
   *      });
   *
   * Metadata is now: `{colors: {background: 'red'}}`
   *
   *      conversation.setMetadataProperties({
   *          'colors.foreground': 'black',
   *      });
   *
   * Metadata is now: `{colors: {background: 'red', foreground: 'black'}}`
   *
   * Executes as follows:
   *
   * 1. Updates the metadata property of the local object
   * 2. Triggers a conversations:change event
   * 3. Submits a request to be sent to the server to update the server's object
   * 4. If there is an error, no errors are fired except by layer.SyncManager, but another
   *    conversations:change event is fired as the change is rolled back.
   *
   * @method setMetadataProperties
   * @param  {Object} properties
   * @return {layer.Conversation} this
   *
   */
  setMetadataProperties(props) {
    const layerPatchOperations = [];
    Object.keys(props).forEach(name => {
      let fullName = name;
      if (name) {
        if (name !== 'metadata' && name.indexOf('metadata.') !== 0) {
          fullName = 'metadata.' + name;
        }
        layerPatchOperations.push({
          operation: 'set',
          property: fullName,
          value: props[name],
        });
      }
    });

    this._inLayerParser = true;

    // Do this before setSyncing as if there are any errors, we should never even
    // start setting up a request.
    Util.layerParse({
      object: this,
      type: 'Conversation',
      operations: layerPatchOperations,
      client: this.getClient(),
    });
    this._inLayerParser = false;

    this._xhr({
      url: '',
      method: 'PATCH',
      data: JSON.stringify(layerPatchOperations),
      headers: {
        'content-type': 'application/vnd.layer-patch+json',
      },
    }, result => {
      if (!result.success) this._load();
    });

    return this;
  }


  /**
   * Deletes specified metadata keys.
   *
   * Updates the local object's metadata and syncs the change to the server.
   *
   *      conversation.deleteMetadataProperties(
   *          ['title', 'colors.background', 'colors.title.fill']
   *      );
   *
   * Use deleteMetadataProperties to specify paths to properties to be deleted.
   * Multiple properties can be deleted.
   *
   * Executes as follows:
   *
   * 1. Updates the metadata property of the local object
   * 2. Triggers a conversations:change event
   * 3. Submits a request to be sent to the server to update the server's object
   * 4. If there is an error, no errors are fired except by layer.SyncManager, but another
   *    conversations:change event is fired as the change is rolled back.
   *
   * @method deleteMetadataProperties
   * @param  {string[]} properties
   * @return {layer.Conversation}
   *
   */
  deleteMetadataProperties(props) {
    const layerPatchOperations = [];
    props.forEach(property => {
      if (property !== 'metadata' && property.indexOf('metadata.') !== 0) {
        property = 'metadata.' + property;
      }
      layerPatchOperations.push({
        operation: 'delete',
        property,
      });
    }, this);

    this._inLayerParser = true;

    // Do this before setSyncing as if there are any errors, we should never even
    // start setting up a request.
    Util.layerParse({
      object: this,
      type: 'Conversation',
      operations: layerPatchOperations,
      client: this.getClient(),
    });
    this._inLayerParser = false;

    this._xhr({
      url: '',
      method: 'PATCH',
      data: JSON.stringify(layerPatchOperations),
      headers: {
        'content-type': 'application/vnd.layer-patch+json',
      },
    }, result => {
      if (!result.success) this._load();
    });

    return this;
  }

  _getUrl(url) {
    return this.url + (url || '');
  }

  _loaded(data) {
    this.getClient()._addConversation(this);
  }

  /**
   * Standard `on()` provided by layer.Root.
   *
   * Adds some special handling of 'conversations:loaded' so that calls such as
   *
   *      var c = client.getConversation('layer:///conversations/123', true)
   *      .on('conversations:loaded', function() {
   *          myrerender(c);
   *      });
   *      myrender(c); // render a placeholder for c until the details of c have loaded
   *
   * can fire their callback regardless of whether the client loads or has
   * already loaded the Conversation.
   *
   * @method on
   * @param  {string} eventName
   * @param  {Function} callback
   * @param  {Object} context
   * @return {layer.Conversation} this
   */
  on(name, callback, context) {
    const hasLoadedEvt = name === 'conversations:loaded' ||
      name && typeof name === 'object' && name['conversations:loaded'];

    if (hasLoadedEvt && !this.isLoading) {
      const callNow = name === 'conversations:loaded' ? callback : name['conversations:loaded'];
      Util.defer(() => callNow.apply(context));
    }
    super.on(name, callback, context);

    return this;
  }

  /*
   * Insure that conversation.unreadCount-- can never reduce the value to negative values.
   */
  __adjustUnreadCount(newValue) {
    if (newValue < 0) return 0;
  }

  /**
   * __ Methods are automatically called by property setters.
   *
   * Any change in the unreadCount property will call this method and fire a
   * change event.
   *
   * Any triggering of this from a websocket patch unread_message_count should wait a second before firing any events
   * so that if there are a series of these updates, we don't see a lot of jitter.
   *
   * NOTE: _oldUnreadCount is used to pass data to _updateUnreadCountEvent because this method can be called many times
   * a second, and we only want to trigger this with a summary of changes rather than each individual change.
   *
   * @method __updateUnreadCount
   * @private
   * @param  {number} newValue
   * @param  {number} oldValue
   */
  __updateUnreadCount(newValue, oldValue) {
    if (this._inLayerParser) {
      if (this._oldUnreadCount === undefined) this._oldUnreadCount = oldValue;
      if (this._updateUnreadCountTimeout) clearTimeout(this._updateUnreadCountTimeout);
      this._updateUnreadCountTimeout = setTimeout(() => this._updateUnreadCountEvent(), 1000);
    } else {
      this._updateUnreadCountEvent();
    }
  }

  /**
   * Fire events related to changes to unreadCount
   *
   * @method _updateUnreadCountEvent
   * @private
   */
  _updateUnreadCountEvent() {
    if (this.isDestroyed) return;
    const oldValue = this._oldUnreadCount;
    const newValue = this.__unreadCount;
    this._oldUnreadCount = undefined;

    if (newValue === oldValue) return;
    this._triggerAsync('conversations:change', {
      newValue,
      oldValue,
      property: 'unreadCount',
    });
  }

  /**
   * __ Methods are automatically called by property setters.
   *
   * Any change in the lastMessage pointer will call this method and fire a
   * change event.  Changes to properties within the lastMessage object will
   * not trigger this call.
   *
   * @method __updateLastMessage
   * @private
   * @param  {layer.Message} newValue
   * @param  {layer.Message} oldValue
   */
  __updateLastMessage(newValue, oldValue) {
    if (newValue && oldValue && newValue.id === oldValue.id) return;
    this._triggerAsync('conversations:change', {
      property: 'lastMessage',
      newValue,
      oldValue,
    });
  }

  /**
   * __ Methods are automatically called by property setters.
   *
   * Any change in the participants property will call this method and fire a
   * change event.  Changes to the participants array that don't replace the array
   * with a new array will require directly calling this method.
   *
   * @method __updateParticipants
   * @private
   * @param  {string[]} newValue
   * @param  {string[]} oldValue
   */
  __updateParticipants(newValue, oldValue) {
    if (this._inLayerParser) return;
    const change = this._getParticipantChange(newValue, oldValue);
    if (change.add.length || change.remove.length) {
      change.property = 'participants';
      change.oldValue = oldValue;
      change.newValue = newValue;
      this._triggerAsync('conversations:change', change);
    }
  }

  /**
   * __ Methods are automatically called by property setters.
   *
   * Any change in the metadata property will call this method and fire a
   * change event.  Changes to the metadata object that don't replace the object
   * with a new object will require directly calling this method.
   *
   * @method __updateMetadata
   * @private
   * @param  {Object} newValue
   * @param  {Object} oldValue
   */
  __updateMetadata(newValue, oldValue, paths) {
    if (this._inLayerParser) return;
    if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
      this._triggerAsync('conversations:change', {
        property: 'metadata',
        newValue,
        oldValue,
        paths,
      });
    }
  }

  /**
   * Returns a plain object.
   *
   * Object will have all the same public properties as this
   * Conversation instance.  New object is returned any time
   * any of this object's properties change.
   *
   * @method toObject
   * @return {Object} POJO version of this.
   */
  toObject() {
    if (!this._toObject) {
      this._toObject = super.toObject();
      this._toObject.metadata = Util.clone(this.metadata);
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
   * Create a conversation instance from a server representation of the conversation.
   *
   * If the Conversation already exists, will update the existing copy with
   * presumably newer values.
   *
   * @method _createFromServer
   * @protected
   * @static
   * @param  {Object} conversation - Server representation of a Conversation
   * @param  {layer.Client} client [description]
   * @return {layer.Conversation}        [description]
   */
  static _createFromServer(conversation, client) {
    return new Conversation({
      client,
      fromServer: conversation,
      _fromDB: conversation._fromDB,
    });
  }

  /**
   * Find or create a new converation.
   *
   *      var conversation = layer.Conversation.create({
   *          participants: ['a', 'b'],
   *          distinct: true,
   *          metadata: {
   *              title: 'I am not a title!'
   *          },
   *          client: client,
   *          'conversations:loaded': function(evt) {
   *
   *          }
   *      });
   *
   * Only tries to find a Conversation if its a Distinct Conversation.
   * Distinct defaults to true.
   *
   * Recommend using `client.createConversation({...})`
   * instead of `Conversation.create({...})`.
   *
   * @method create
   * @static
   * @protected
   * @param  {Object} options
   * @param  {layer.Client} options.client
   * @param  {string[]} options.participants - Array of participant ids
   * @param {boolean} [options.distinct=false] - Create a distinct conversation
   * @param {Object} [options.metadata={}] - Initial metadata for Conversation
   * @return {layer.Conversation}
   */
  static create(options) {
    if (!options.client) throw new Error(LayerError.dictionary.clientMissing);
    if (options.distinct) {
      const conv = this._createDistinct(options);
      if (conv) return conv;
    }

    return new Conversation(options);
  }

  /**
   * Create or Find a Distinct Conversation.
   *
   * If the static Conversation.create method gets a request for a Distinct Conversation,
   * see if we have one cached.
   *
   * Will fire the 'conversations:loaded' event if one is provided in this call,
   * and a Conversation is found.
   *
   * @method _createDistinct
   * @static
   * @private
   * @param  {Object} options - See layer.Conversation.create options
   * @return {layer.Conversation}
   */
  static _createDistinct(options) {
    if (options.participants.indexOf(options.client.user.userId) === -1) {
      options.participants.push(options.client.user.userId);
    }

    const participants = options.participants.sort();
    const pString = participants.join(',');

    const conv = options.client.findCachedConversation(aConv => {
      if (aConv.distinct && aConv.participants.length === participants.length) {
        const participants2 = aConv.participants.sort();
        return participants2.join(',') === pString;
      }
    });

    if (conv) {
      conv._sendDistinctEvent = new LayerEvent({
        target: conv,
        result: !options.metadata || Util.doesObjectMatch(options.metadata, conv.metadata) ?
          Conversation.FOUND : Conversation.FOUND_WITHOUT_REQUESTED_METADATA,
      }, 'conversations:sent');
      return conv;
    }
  }

  /**
   * Identifies whether a Conversation receiving the specified patch data should be loaded from the server.
   *
   * Any change to a Conversation indicates that the Conversation is active and of potential interest; go ahead and load that
   * Conversation in case the app has need of it.  In the future we may ignore changes to unread count.  Only relevant
   * when we get Websocket events for a Conversation that has not been loaded/cached on Client.
   *
   * @method _loadResourceForPatch
   * @static
   * @private
   */
  static _loadResourceForPatch(patchData) {
    return true;
  }
}

/**
 * Array of participant ids.
 *
 * Do not directly manipulate;
 * use addParticipants, removeParticipants and replaceParticipants
 * to manipulate the array.
 *
 * @type {string[]}
 */
Conversation.prototype.participants = null;

/**
 * Time that the conversation was created on the server.
 *
 * @type {Date}
 */
Conversation.prototype.createdAt = null;

/**
 * Number of unread messages in the conversation.
 *
 * @type {number}
 */
Conversation.prototype.unreadCount = 0;

/**
 * This is a Distinct Conversation.
 *
 * You can have 1 distinct conversation among a set of participants.
 * There are no limits to how many non-distinct Conversations you have have
 * among a set of participants.
 *
 * @type {boolean}
 */
Conversation.prototype.distinct = true;

/**
 * Metadata for the conversation.
 *
 * Metadata values can be plain objects and strings, but
 * no arrays, numbers, booleans or dates.
 * @type {Object}
 */
Conversation.prototype.metadata = null;


/**
 * The authenticated user is a current participant in this Conversation.
 *
 * Set to false if the authenticated user has been removed from this conversation.
 *
 * A removed user can see messages up to the time they were removed,
 * but can no longer interact with the conversation.
 *
 * A removed user can no longer see the participant list.
 *
 * Read and Delivery receipts will fail on any Message in such a Conversation.
 *
 * @type {Boolean}
 */
Conversation.prototype.isCurrentParticipant = true;

/**
 * The last layer.Message to be sent/received for this Conversation.
 *
 * Value may be a Message that has been locally created but not yet received by server.
 * @type {layer.Message}
 */
Conversation.prototype.lastMessage = null;

/**
 * Caches last result of toObject()
 * @type {Object}
 * @private
 */
Conversation.prototype._toObject = null;

Conversation.eventPrefix = 'conversations';

/**
 * Cache's a Distinct Event.
 *
 * On creating a Distinct Conversation that already exists,
 * when the send() method is called, we should trigger
 * specific events detailing the results.  Results
 * may be determined locally or on the server, but same Event may be needed.
 *
 * @type {layer.LayerEvent}
 * @private
 */
Conversation.prototype._sendDistinctEvent = null;

/**
 * Prefix to use when generating an ID for instances of this class
 * @type {String}
 * @static
 * @private
 */
Conversation.prefixUUID = 'layer:///conversations/';

/**
 * Property to look for when bubbling up events.
 * @type {String}
 * @static
 * @private
 */
Conversation.bubbleEventParent = 'getClient';

/**
 * The Conversation that was requested has been created.
 *
 * Used in 'conversations:sent' events.
 * @type {String}
 * @static
 */
Conversation.CREATED = 'Created';

/**
 * The Conversation that was requested has been found.
 *
 * This means that it did not need to be created.
 *
 * Used in 'conversations:sent' events.
 * @type {String}
 * @static
 */
Conversation.FOUND = 'Found';

/**
 * The Conversation that was requested has been found, but there was a mismatch in metadata.
 *
 * If the createConversation request contained metadata and it did not match the Distinct Conversation
 * that matched the requested participants, then this value is passed to notify your app that the Conversation
 * was returned but does not exactly match your request.
 *
 * Used in 'conversations:sent' events.
 * @type {String}
 * @static
 */
Conversation.FOUND_WITHOUT_REQUESTED_METADATA = 'FoundMismatch';

Conversation._supportedEvents = [



  /**
   * The conversation is now on the server.
   *
   * Called after successfully creating the conversation
   * on the server.  The Result property is one of:
   *
   * * Conversation.CREATED: A new Conversation has been created
   * * Conversation.FOUND: A matching Distinct Conversation has been found
   * * Conversation.FOUND_WITHOUT_REQUESTED_METADATA: A matching Distinct Conversation has been found
   *                       but note that the metadata is NOT what you requested.
   *
   * All of these results will also mean that the updated property values have been
   * copied into your Conversation object.  That means your metadata property may no
   * longer be its initial value; it may be the value found on the server.
   *
   * @event
   * @param {layer.LayerEvent} event
   * @param {string} event.result
   */
  'conversations:sent',

  /**
   * An attempt to send this conversation to the server has failed.
   * @event
   * @param {layer.LayerEvent} event
   * @param {layer.LayerError} event.error
   */
  'conversations:sent-error',

  /**
   * The conversation is now loaded from the server.
   *
   * Note that this is only used in response to the layer.Conversation.load() method.
   * from the server.
   * @event
   * @param {layer.LayerEvent} event
   */
  'conversations:loaded',

  /**
   * An attempt to load this conversation from the server has failed.
   *
   * Note that this is only used in response to the layer.Conversation.load() method.
   * @event
   * @param {layer.LayerEvent} event
   * @param {layer.LayerError} event.error
   */
  'conversations:loaded-error',

  /**
   * The conversation has been deleted from the server.
   *
   * Caused by either a successful call to delete() on this instance
   * or by a remote user.
   * @event
   * @param {layer.LayerEvent} event
   */
  'conversations:delete',

  /**
   * This conversation has changed.
   *
   * @event
   * @param {layer.LayerEvent} event
   * @param {Object[]} event.changes - Array of changes reported by this event
   * @param {Mixed} event.changes.newValue
   * @param {Mixed} event.changes.oldValue
   * @param {string} event.changes.property - Name of the property that changed
   * @param {layer.Conversation} event.target
   */
  'conversations:change'].concat(Syncable._supportedEvents);

Root.initClass.apply(Conversation, [Conversation, 'Conversation']);
Syncable.subclasses.push(Conversation);
module.exports = Conversation;
