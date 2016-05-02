const Message = require('./message');
const Syncable = require('./syncable');
const Root = require('./root');


class Announcement extends Message {
  send() {}
  getConversation() {}

  _loaded(data) {
    this.getClient()._addMessage(this);
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
   * @param  {layer.Conversation} conversation - Conversation for the message
   * @return {layer.Message}
   */
  static _createFromServer(message, client) {
    const fromWebsocket = message.fromWebsocket;
    return new Announcement({
      fromServer: message,
      clientId: client.appId,
      _notify: fromWebsocket && message.is_unread,
    });
  }
}

Announcement.prefixUUID = 'layer:///announcements/';

Announcement.inObjectIgnore = Message.inObjectIgnore;

Announcement.bubbleEventParent = 'getClient';

Announcement._supportedEvents = [].concat(Message._supportedEvents);

Root.initClass.apply(Announcement, [Announcement, 'Announcement']);
Syncable.subclasses.push(Announcement);
module.exports = Announcement;
