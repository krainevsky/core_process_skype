var TICK = 250;

function Skype() {};

Skype.prototype = {
  connectionStatus : { conOffline : 0, conConnecting : 1, conPausing : 2, conOnline : 3 },
  attachmentStatus : { success : 0, apiNotAvailable : 3, apiAvailable : 4 },
  obj : null,
  TIMEOUT : 30000,

  //Starts the skype and returns skype COM object in case of success
  //otherwise returns null
  run : function() {
    try {
      Log.PushLogFolder(Log.CreateFolder("Starting skype"));
      if (!this.obj) {
        this.obj = Sys.OleObject("Skype4COM.Skype");
      }
      if (!this.obj.Client.IsRunning) {
        this.obj.Client.Start(true, true);

        //Waiting for 'running' status
        if (!this.waitIsRunning(true)) {
          throw new Error("Failed to wait for startup");
        }

        //Trying to attach to public API
        this.obj.Attach(8, false);
        if (!this.waitAttachmentStatus(this.attachmentStatus.apiAvailable)) {
          throw new Error("Failed to attach to API");
        }

        //Waiting for 'online' connection status
        if (!this.waitConnectionStatus(this.connectionStatus.conOnline)) {
          throw new Error("Failed to wait for connection");
        }
      }
      //The skype is ready
      Log.Message(aqString.Format("Skype is logged in under '%s'", this.obj.CurrentUserHandle));
      return this.obj;
    } catch (exception) {
      Log.Message("Failed to run skype", exception.message);
    } finally {
      Log.PopLogFolder();
    }
  },

  //Closes the skype and waits for process to disappear
  close : function() {
    try {
      Log.PushLogFolder(Log.CreateFolder("Closing skype"));
      if (this.obj) {
        if (this.obj.Client.IsRunning) {
          this.obj.Client.Shutdown();
          if (!this.waitIsRunning(false)) {
            throw new Error("Failed to wait for shutdown");
          }
          if (this.waitProcessClose()) {
            Log.Message("Skype closed successfully");
          }
        }
      }
    } finally {
      Log.PopLogFolder();
    }
  },

  //Tries to send 'text' to a friend with handle 'name' and if there is no
  //such friend tries to send message to bookmarked chat with topic 'name'
  sendMessage : function(name, text) {
    try {
      var header = aqString.Format("Sending message to '%s'", name);
      Log.PushLogFolder(Log.CreateFolder(header, text));
      if (this.run()) {
        if (this.getFriendByHandle(name)) {
          var message = this.obj.SendMessage(name, text);
          if (!this.waitMessageStatus(message, "SENT")) {
            throw new Error("Failed to wait for message to send");
          }
        } else {
          this.sendMessageToBookmarkedChat(name, text);
        }
      }
    } finally {
      Log.PopLogFolder();
    }
  },

  //Sends 'text' to friend with specified 'name'
  sendMessageToFriend : function(handle, text) {
    try {
      var header = aqString.Format("Sending message to '%s'", handle);
      Log.PushLogFolder(Log.CreateFolder(header, text));
      if (!this.getFriendByHandle(handle)) {
        throw new Error(aqString.Format("Unable to find friend with handle '%s'", handle));
      }
      var message = this.obj.SendMessage(handle, text);
      if (!this.waitMessageStatus(message, "SENT")) {
        throw new Error("Failed to wait for message to send");
      }
    } finally {
      Log.PopLogFolder();
    }
  },

  //Sends 'text' to a bookmarked chat with specified 'topic'
  sendMessageToBookmarkedChat : function(topic, text) {
    try {
      var header = aqString.Format("Sending message to '%s'", topic);
      Log.PushLogFolder(Log.CreateFolder(header, text));
      var chat = this.getBookmarkedChatByTopic(topic);
      if (!chat) {
        throw new Error(aqString.Format("Unable to find bookmarked chat with topic '%s'", topic));
      }
      var message = chat.SendMessage(text);
      if (!this.waitMessageStatus(message, "SENT")) {
        throw new Error("Failed to wait for message to send");
      }
    } finally {
      Log.PopLogFolder();
    }
  },

  //Waits until Skype client running state will be equal to 'state' parameter
  //Returns true if it happend before 'timeout' expired and false otherwise
  waitIsRunning : function(state, timeout) {
    timeout = timeout || this.TIMEOUT;
    for (var i = timeout / TICK ; i ; i--) {
      if (state == this.obj.Client.IsRunning) {
        return true;
      }
      aqUtils.Delay(TICK);
    }
    return false;
  },

  //Waits until Skype's API attachment status will be equal to 'status'
  //Returns true if it happend before 'timeout' expired and false otherwise
  waitAttachmentStatus : function(status, timeout) {
    timeout = timeout || this.TIMEOUT;
    for (var i = timeout / TICK ; i ; i--) {
      if (status == this.obj.AttachmentStatus) {
        return true;
      }
      aqUtils.Delay(TICK);
    }
    return false;
  },

  //Waits until Skype's connection status will be equal to 'status' parameter
  //Returns true if it happend before 'timeout' expired and false otherwise  
  waitConnectionStatus : function(status, timeout) {
    timeout = timeout || this.TIMEOUT;
    for (var i = timeout / TICK ; i ; i--) {
      if (status == this.obj.ConnectionStatus) {
        return true;
      }
      aqUtils.Delay(TICK);
    }
    return false;
  },

  //Finds a process 'Skype' and waits for this process to be closed
  //If process didn't close by himself in 'timeout' the warning will be posted
  //and Terminate method called. In this case function will return false. 
  //In all other cases function returns true; 
  waitProcessClose : function(timeout) {
    timeout = timeout || this.TIMEOUT;
    var process = Sys.WaitProcess("Skype");
    if (!process.WaitProperty("Exists", false, timeout)) {
      Log.Warning("Failed to wait for 'Skype' process to close");
      process.Terminate();
      return false;
    }
    return true;
  },

  //Waits for desired message status
  //Returns true is it happend before 'timeout' expired and false otherwise
  waitMessageStatus : function(message, status, timeout) {
    timeout = timeout || this.TIMEOUT;
    status = this.obj.Convert.TextToChatMessageStatus(status);
    for (var i = timeout / TICK ; i ; i--) {
      if (status == message.Status) {
        return true;
      }
      aqUtils.Delay(TICK);
    }
    return false;
  },

  //Returns a Friend with specified 'handle'
  getFriendByHandle : function(handle) {
    //Careful cause it's written Delphi
    for (var i = 1 ; i <= this.obj.Friends.Count ; i++) {
      var friend = this.obj.Friends.Item(i);
      if (handle == friend.Handle) {
        return friend;
      }
    }
  },
  
  //Returns a bookmarked chat with specified 'topic'
  getBookmarkedChatByTopic : function(topic) {
    //Careful cause it's written Delphi
    for (var i = 1 ; i <= this.obj.BookmarkedChats.Count ; i++) {
      var chat = this.obj.BookmarkedChats.Item(i);
      if (topic == chat.Topic) {
        return chat;
      }
    }
  }
}

var skype = new Skype();

function test() {
  skype.sendMessage("user.handle", "test")
}