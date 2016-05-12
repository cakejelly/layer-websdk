// TODO: Integrate/Remove User object
/**
 * The Identity class represents an Identity of a participant in a Conversation or sender of a Message in a Conversation.
 *
 * Identities are created by the System, never directly by apps.
 *
 * @class layer.Identity
 * @extends layer.Syncable
 */

/*
 * How Identities fit into the system:
 *
 * 1. As part of initialization, load the authenticated user’s full Identity record so that the Client knows more than just the `userId` of its user.
 *    client.user = <UserIdentity>
 * 2. Any time we get a Basic Identity via `message.sender` or Conversations, see if we have an Identity for that sender,
 *    and if not create one using the Basic Identity.  There should never be a duplicate Identity.
 * 3. Websocket CHANGE events will update Identity objects, as well as add new Full Identities, and downgrade Full Identities to Basic Identities.
 * 4. There are two types of Identities: UserIdentity and ServiceIdentity.  Both will have `displayName`;
 *    UserIdentity will have `first_name`, `last_name`, etc…; ServiceIdentity will have `name` (Admin, Moderator, etc…).
 * 5. The Query API supports querying and paging through Identities
 * 6. The Query API loads Full Identities; these results will update the client._identitiesHash;
 *    upgrading Basic Identities if they match, and adding new Identities if they don't.
 * 7. DbManager will persist only UserIdentities, and only those that are Full Identities.  Basic Identities will be written
 *    to the Messages and Conversations tables anyways as part of those larger objects.
 * 8. API For explicit follows/unfollows
 */

const Syncable = require('./syncable');
const Root = require('./root');
const Constants = require('./const');
const LayerError = require('./layer-error');

class Identity extends Syncable {
  constructor(options = {}) {
    // Make sure the ID from handle fromServer parameter is used by the Root.constructor
    if (options.fromServer) options.id = options.fromServer.id;

    // Make sure we have an clientId property
    if (options.client) options.clientId = options.client.appId;
    if (!options.clientId) throw new Error(LayerError.dictionary.clientMissing);

    super(options);

    this.isInitializing = true;

    // If the options contains a full server definition of the object,
    // copy it in with _populateFromServer; this will add the Conversation
    // to the Client as well.
    if (options && options.fromServer) {
      this._populateFromServer(options.fromServer);
    }

    this.isInitializing = false;
  }

  destroy() {
    const client = this.getClient();
    if (client) client._removeIdentity(this);
    super.destroy();
  }
}

/**
 * Display name for the User or System Identity.
 * @type {string}
 */
Identity.prototype.displayName = '';

/**
 * The Identity matching `layer.Client.user` will have this be true.
 *
 * All other Identities will have this as false.
 * @type {boolean}
 */
Identity.prototype.sessionOwner = false;

/**
 * ID of the Client this Identity is associated with.
 * @type {string}
 */
Identity.prototype.clientId = '';

/**
 * Is this a Full Identity or Basic Identity?
 *
 * Note that Service Identities are always considered to be Basic.
 * @type {boolean}
 */
Identity.prototype.isFullIdentity = false;

Identity.inObjectIgnore = Root.inObjectIgnore;

Identity.bubbleEventParent = 'getClient';

Root.initClass.apply(Identity, [Identity, 'Identity']);

/**
 * The most common type of Identity is the UserIdentity, representing
 * a user of your application, able to be a full participant of your Conversations,
 * and able, with a SessionToken to create new Conversations with other Users.
 *
 * These are only created by the WebSDK for you, never created by you directly.
 *
 * @class layer.UserIdentity
 * @extends layer.Identity
 */
class UserIdentity extends Identity {
  constructor(options) {
    super(options);
    if (!this.url) this.url = `${this.getClient().url}/identities/${this.userId}`;
  }

  /**
   * Populates this instance using server-data.
   *
   * Side effects add this to the Client.
   *
   * @method _populateFromServer
   * @private
   * @param  {Object} identity - Server representation of the identity
   */
  _populateFromServer(identity) {
    const client = this.getClient();

    // Disable events if creating a new Identity
    // We still want property change events for anything that DOES change
    this._disableEvents = (this.syncState === Constants.SYNC_STATE.NEW);

    this._setSynced();

    this.userId = identity.user_id;

    this._updateValue('avatarUrl', identity.avatar_url);
    this._updateValue('displayName', identity.display_name);

    const isFullIdentity = 'metadata' in identity;

    // Handle Full Identity vs Basic Identity
    if (isFullIdentity) {
      this.url = identity.url;

      this._updateValue('emailAddress', identity.email_address);
      this._updateValue('lastName', identity.last_name);
      this._updateValue('firstName', identity.first_name);
      this._updateValue('metadata', identity.metadata);
      this._updateValue('publicKey', identity.public_key);
      this._updateValue('phoneNumber', identity.phone_number);
      this.isFullIdentity = true;
    }

    if (!this.url) {
      this.url = this.getClient().url + this.id.substring(8);
    }

    client._addIdentity(this);
    this._disableEvents = false;

    // See if we have the Full Identity Object in database
    if (!this.isFullIdentity) {
      client.dbManager.getObjects('identities', [this.id], (result) => {
        if (result.length) this._populateFromServer(result[0]);
      });
    }
  }

  /**
   * Update the property; trigger a change event, IF the value has changed.
   *
   * @method _updateValue
   * @private
   * @param {string} key - Property name
   * @param {Mixed} value - Property value
   */
  _updateValue(key, value) {
    if (this[key] !== value) {
      if (!this.isInitializing) {
        this._triggerAsync('identities:change', {
          property: key,
          oldValue: this[key],
          newValue: value,
        });
      }
      this[key] = value;
    }
  }

  /**
   * Follow this User.
   *
   * Following a user grants access to their Full Identity,
   * as well as websocket events that update the Identity.
   * @method follow
   */
  follow() {
    if (this.isFullIdentity) return;
    this._xhr({
      method: 'PUT',
      url: this.url.replace(/identities/, 'following'),
      syncable: {},
    }, (result) => {
      if (result.success) this._load();
    });
  }

  /**
   * Unfollow this User.
   *
   * Unfollowing the user will reduce your access to only having their Basic Identity,
   * and this Basic Identity will only show up when a relevant Message or Conversation has been loaded.
   *
   * Websocket change notifications for this user will not arrive.
   *
   * @method unfollow
   */
  unfollow() {
    this._xhr({
      url: this.url.replace(/identities/, 'following'),
      method: 'DELETE',
      syncable: {},
    });
  }

  /**
   * After a successful call to _load(), register the Identity.
   *
   * @method _loaded
   * @protected
   * @param {Object} data - Identity data loaded from the server
   */
  _loaded(data) {
    this.getClient()._addIdentity(this);
  }

  /**
   * Handle a Websocket DELETE event received from the server.
   *
   * A DELETE event means we have unfollowed this user; and should downgrade to a Basic Identity.
   *
   * @method _handleWebsocketDelete
   * @protected
   * @param {Object} data - Deletion parameters; typically null in this case.
  */
  // Turn a Full Identity into a Basic Identity and delete the Full Identity from the database
  _handleWebsocketDelete(data) {
    this.getClient().dbManager.deleteObjects('identities', [this]);
    ['firstName', 'lastName', 'emailAddress', 'phoneNumber', 'metadata', 'publicKey', 'isFullIdentity'].forEach(key => delete this[key]);
    this._triggerAsync('identities:unfollow');
  }

  /**
   * Create a new Identity based on a Server description of the user.
   *
   * @method _createFromServer
   * @static
   * @param {Object} identity - Server Identity Object
   * @param {layer.Client} client
   * @returns {layer.UserIdentity}
   */
  static _createFromServer(identity, client) {
    return new UserIdentity({
      client,
      fromServer: identity,
      _fromDB: identity._fromDB,
    });
  }
}

/**
 * Unique ID for this User.
 * @type {string}
 */
UserIdentity.prototype.userId = '';

/**
 * Optional URL for the user's icon.
 * @type {string}
 */
UserIdentity.prototype.avatarUrl = '';

/**
 * Optional first name for this user.
 *
 * Full Identities Only.
 *
 * @type {string}
 */
UserIdentity.prototype.firstName = '';

/**
 * Optional last name for this user.
 *
 * Full Identities Only.
 *
 * @type {string}
 */
UserIdentity.prototype.lastName = '';

/**
 * Optional email address for this user.
 *
 * Full Identities Only.
 *
 * @type {string}
 */
UserIdentity.prototype.emailAddress = '';

/**
 * Optional phone number for this user.
 *
 * Full Identities Only.
 *
 * @type {string}
 */
UserIdentity.prototype.phoneNumber = '';

/**
 * Optional metadata for this user.
 *
 * Full Identities Only.
 *
 * @type {object}
 */
UserIdentity.prototype.metadata = null;

/**
 * Optional public key for encrypting message text for this user.
 *
 * Full Identities Only.
 *
 * @type {string}
 */
UserIdentity.prototype.publicKey = '';

UserIdentity.inObjectIgnore = Identity.inObjectIgnore;

UserIdentity.bubbleEventParent = 'getClient';

UserIdentity._supportedEvents = [
  'identities:loaded',
  'identities:loaded-error',
  'identities:unfollow',
];

UserIdentity.eventPrefix = 'identities';
UserIdentity.prefixUUID = 'layer:///identities/';
UserIdentity.enableOpsIfNew = true;

Root.initClass.apply(UserIdentity, [UserIdentity, 'UserIdentity']);
Syncable.subclasses.push(UserIdentity);

/**
 * A less common type of Identity is the ServiceIdentity.
 * This represents a Service Message such as is posted by your service,
 * using some custom name, but sent, not as a Participant of a Conversation, but rather as
 * a System Message.  Bots are common examples of this.  An Administrator might post an announcement
 * this way.  A service posting new news and events might simply post as `News Bot`, which is not
 * a participant, just a named service.
 *
 * @class layer.ServiceIdentity
 * @extends layer.Identity
 */
class ServiceIdentity extends Identity {
  /**
   * Populates this instance using server-data.
   *
   * Side effects add this to the Client.
   *
   * @method _populateFromServer
   * @private
   * @param  {Object} identity - Server representation of the identity
   */
  _populateFromServer(identity) {
    const client = this.getClient();

    // Disable events if creating a new Identity
    // We still want property change events for anything that DOES change
    this._disableEvents = (this.syncState === Constants.SYNC_STATE.NEW);

    this._setSynced();

    this.id = identity.id;
    this.name = identity.name;
    this.displayName = identity.name;

    client._addIdentity(this);
    this._disableEvents = false;
  }

  /**
   * Create a layer.ServiceIdentity from the Server's Identity Object.
   *
   * Input Identity Object must have a `name` field.
   */
  static _createFromServer(identity, client) {
    return new ServiceIdentity({
      client,
      fromServer: identity,
      _fromDB: identity._fromDB,
    });
  }
}

/**
 * Name of the service sending Messages.
 *
 * @type {string}
 */
ServiceIdentity.prototype.name = '';

ServiceIdentity._supportedEvents = [
  'identities:loaded',
  'identities:loaded-error',
];

ServiceIdentity.eventPrefix = 'serviceidentities';

ServiceIdentity.prefixUUID = 'layer:///serviceidentities/';

Root.initClass.apply(ServiceIdentity, [ServiceIdentity, 'ServiceIdentity']);
Syncable.subclasses.push(ServiceIdentity);

module.exports = {
  Identity,
  UserIdentity,
  ServiceIdentity,
};
