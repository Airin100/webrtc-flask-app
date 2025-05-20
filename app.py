from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_session import Session 
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'my-secret-key'
app.config['SESSION_TYPE'] = 'FILESYSTEM'
Session(app)
socketio = SocketIO(app, manage_session = False)
rooms = {}

# room_name:{password, host_sid, users:{sid:usermane}, lobby:{sid:username}}

sid_to_room = {}
@app.route('/', methods = ['GET','POST'])

def login():
    if request.method == 'POST':
        username =  request.form.get('username')
        room = request.form.get('room')
        password = request.form.get('password','')
        if not username or not room: 
         return
        render_template('login.html', error = "Username and Room required")
        session['username'] = username
        session['room'] = room
        session['password'] = password
        return redirect(url_for('room'))
    return render_template('login.html')


@app.route('/room')
def room():
   if 'username'not in session or 'room' not in session:
      return redirect(url_for('login.html'))
   return render_template('index.html',
                username = session['username'],
                room = session['room'], 
                password = session['password'])

def emit_user_list(room):
    if room in rooms and 'users' in rooms[room]:
        user_list = list(rooms[room]['users'].values())
        socketio.emit('user_list', {'users': user_list}, room=room)

@socketio.on('join')
def on_join(data):
   room = data['room']
   username = data['username']
   password = data.get('password','')
   sid = request.sid
   sid_to_room[sid] = room
   if room not in rooms:

      #Create Room, First User is Host

      rooms[room] = {password : password,
                     'host_sid' : sid,
                     'user' : {sid : username},
                     'lobby' : {}}
      join_room(room)
      emit('host', {'is_host' : True})
      emit_user_list(room)
   else:

      #Existing rooms : check password

      if rooms[room] ['password'] != password : emit('join_error', {'error' : 'Incorrect Room Password.'})
      return
   
   #Put user in lobby , wait approval from host

   rooms[room]['lobby']
   [sid] = username
   emit('lobby_wait', {'message' : 'Waiting for Host approval.'})
   emit('lobby_request',
        {'sid' : sid, 'username' : username}, to = rooms[room] ['host_sid'])
   
   def emit_userlist(room):
      user_list = list(rooms[room]['users'].values())
      socketio.emit('user_list',
                    {'users' : user_list}, room = room)
      
      @socketio.on('approve_user')
      def approve_user(data):
         room = sid_to_room.get(request.sid)
         sid = data['sid']
         if sid in rooms[room]['lobby']:
            username = rooms[room]['lobby'].pop(sid)
         rooms[room]['users']
         [sid] = username 
         socketio.server.enter_room(sid, room)
         socketio.emit('join_approved', room = sid)
         emit_user_list(room)

@socketio.on('reject_user')
def reject_user(data):
   room = sid_to_room.get(request.sid)
   sid = data['sid']
   if sid in rooms[room]['lobby']:
      rooms[room]['lobby'].pop(sid)
      socketio.emit('join_rejected',
                    {'message' : 'Host rejected your request.'},
                    room = sid)
      
      socketio.on('disconnect')
      def on_disconnect():
       sid = request.sid
       room = sid_to_room.pop(sid, None)

      if room and room in rooms:
        info = rooms[room]
        if sid in info['users']:info['users'].pop(sid)
        emit_user_list(room)
        leave_room(room)
        if sid == info['host_sid']:
            
            #Assign new host if possible

            if info['users']:
               new_host_sid = next(iter(info['users'])) 
               info['host_sid'] = new_host_sid
               socketio.emit('host',
                             {'is_host' : True}, room = new_host_sid)
            else:

               # No users left, Remove room

               rooms.pop(room)
        elif sid in info['lobby']:
            info['lobby'].pop(sid)

         # WebRTC signaling

      @socketio.on('signal')
      def on_signal(data):
            to_sid = data['to']
            signal_data = data['signal']
            socketio.emit('signal',
                          {'from' : request.sid, 'signal':
                           signal_data}, room = to_sid)
            
            @socketio.on('mute')
            def on_mute(data):
               room = sid_to_room.get(request.sid)
               sid = request.sid
               muted = data.get('muted', False)
               socketio.emit('mute',
                             {'sid' : sid, 'muted' : muted},
                             room = room)
               
               @socketio.on('video_toggle')
               def on_video_toggle(data):
                  room = sid_to_room.get(request.sid)
                  sid = request.sid
                  video_on = data.get('video_on', True)
                  socketio.emit('video_toggle',
                                {'sid' : sid, video_on : video_on},
                                room = room)
                  
                  @socketio.on('screen_share')
                  def on_screen_share(data):
                     room = sid_to_room.get(request.sid)
                     sid = request.sid
                     sharing = data.get('sharing', False)
                     socketio.emit('svreen_share',
                                   {'sid' : sid, 'sharing' : sharing},
                                   room = room)
                     
                     if __name__ == '__main__':
                        port = int(os.environ.get('PORT', 5000))
                        socketio.run(app, host = '0.0.0.0', port = port)