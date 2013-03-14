#! /usr/bin/env python

import tornado.httpserver
import tornado.websocket
import tornado.ioloop
import tornado.web

import socket
import subprocess
import thread
import functools
import string

import argparse
import os
import json
import fcntl
import errno
import base64
import time

from collections import deque

g_sessions = {}

# Messages 
# The typical message is of the form {'type' : 'message type', 'msg' : <message>, 'user' : <user>, 'session' : <Session>}
# Messages are bi-directional, the same message format is sent in either direction...

# Message types

MSG_INIT   =    'init'
MSG_CMD    =    'cmd'
MSG_ERROR  =    'err'
MSG_RESP   =    'resp'
MSG_PLOT   =    'plot' 
MSG_ENV    =    'env' 

SESSIONS_DIR = "/tmp/jl_sessions/"




    

def push_to_clients (fin, jh, fd, events):
    data = fin.read(8192)

    if ("\n" in data) or ("julia>" in data):
        send_data = jh.resp_buffer + data
            
        send_obj = {}
        send_obj['type'] = MSG_RESP
        send_obj['msg'] = [base64.b64encode(send_data)]
        send_str = json.dumps(send_obj, ensure_ascii=True)
        
        for (u, wsh) in jh.clients:
            wsh.write_message(send_str) 
        
        jh.history.append(send_str)
        if len(jh.history) > 10:
            jh.history.popleft()
            
        jh.resp_buffer = ''
        
        # Check to see if any new files have been created....
        check_for_images(jh)
                    
    else:
        jh.resp_buffer = jh.resp_buffer + data


def check_for_images(jh):
        # TODO optimize this....
        
        wdir = SESSIONS_DIR + jh.session
        for f in os.listdir(wdir):
            (fpart, ext) = os.path.splitext(f)
            
            file_fpath = wdir + '/' + f
            finfo = os.stat(file_fpath)
            
            if ext in [".png", ".svg", ".gif", ".jpg", ".jpeg"]:
                if finfo.st_mtime >= jh.mtime:
                    jh.mtime = finfo.st_mtime
                    
                    send_obj = {}
                    send_obj['type'] = MSG_PLOT
                    send_obj['msg'] = f
                    send_str = json.dumps(send_obj, ensure_ascii=True)
                    
                    for (u, wsh) in jh.clients:
                        wsh.write_message(send_str) 
                        
            if ((jh.mtime - finfo.st_ctime) > 300.0) :
                    # cleanup files older than 5 minutes
                    # TODO - Better mechanism to auto cleanup.
                    os.remove(file_fpath)



class JuliaHandler():
    def __init__(self, session, user, ws_handler):
        global args
        wdir = SESSIONS_DIR + session

        mkdir_p(wdir)
        
        
        # Delete and create a dummy file so that the directory mtime changes....
        # 
        
        tmp_fname = wdir + '/' + str(time.time())

        ftmp = open(tmp_fname, 'w+')
        ftmp.close()
        os.remove(tmp_fname)
        
        self.mtime = os.stat(wdir).st_mtime;
        
        self.h = subprocess.Popen(args.julia, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=wdir)
        self.session = session

        jl_stdout = self.h.stdout.fileno()
        flags = fcntl.fcntl(jl_stdout, fcntl.F_GETFL)| os.O_NDELAY
        fcntl.fcntl(jl_stdout, fcntl.F_SETFL, flags)
        ioloop.add_handler(jl_stdout, functools.partial(push_to_clients, self.h.stdout, self), ioloop.READ|ioloop.ERROR)
    
        global g_sessions
        g_sessions[session] = self
        
        self.resp_buffer = ''
        self.clients = []
        
        self.history = deque([])
        self.add_user(user, ws_handler)
        self.cmd_q = deque()
    
    def add_user(self, user, ws_handler):
        # make sure it is unique
        if (user, ws_handler) in self.clients:
            return
        
        self.clients.append((user, ws_handler))

        send_obj = {}
        send_obj['type'] = MSG_ENV
        send_obj['msg'] = {'user':user, 'session':self.session}
        send_str = json.dumps(send_obj, ensure_ascii=True)
        
        ws_handler.write_message(send_str) 
        
        for hist_msg in self.history:
            ws_handler.write_message(hist_msg) 

        
    def rm_user(self, user, ws_handler):    
        if (user, ws_handler) in self.clients:
            self.clients.remove((user, ws_handler))

        # If no one is attached just kill the julia....            
        if self.clients == []:
            global ioloop
            ioloop.remove_handler(self.h.stdout.fileno())
            
            self.h.kill()
            # TODO : Collect returncode to avoid zombies.....
            
            # remove from global map.
            global g_sessions
            del g_sessions[self.session]





class WSHandler(tornado.websocket.WebSocketHandler):
    jh = None
    
    def open(self):
        self.user = 'guest'
        print 'new connection'
      
    def on_message(self, msg_in):
        msg = cnv_to_str(json.loads(msg_in))
        if 'type' not in msg:
            print "No type in JSON : " + msg_in
            return
            
        if (self.jh == None) and (msg['type'] == MSG_INIT) :
            self.do_init(msg)

        elif (self.jh == None):        
            self.do_init(msg)

                
        if  msg['type'] == MSG_CMD:
            for m in msg['msg']:
                # Split command on linebreaks....and add it to the julia handler's cmd_q....
                cmd_to_jl = "\r".join(map(lambda s: '{} # <{}>'.format(s, self.user) if len(s) > 70 else '{:<70}# <{}>'.format(s, self.user), m.splitlines() )) + '\r'
                
                self.jh.h.stdin.write(cmd_to_jl)
                self.jh.h.stdin.flush()
                    
#                    self.jh.cmd_q.append(split_cmd.strip())
            
        elif msg['type'] != MSG_INIT:
            print "Unknown message type : " + str(msg['type'])


    def do_init(self, msg):
            if 'user' not in msg:
                msg['user'] = 'guest'
                
            self.user = msg['user']
            
            if 'session' not in msg:
               msg['session'] = 'default'
               
            elif msg['session'] == '':
               msg['session'] = 'default'
            

            # See if a session exists
            global g_sessions
            if msg['session'] in g_sessions:
                self.jh = g_sessions[msg['session']]
                self.jh.add_user(msg['user'], self)
                
            else:
                self.jh = JuliaHandler(msg['session'], msg['user'], self)
        
 
    def on_close(self):
        if self.jh != None:
            self.jh.rm_user(self.user, self)    
            
        print 'connection closed'

        

application = tornado.web.Application([
    (r'/ws', WSHandler),
])
 

def cnv_to_str(input):
    if isinstance(input, dict):
        return {cnv_to_str(key): cnv_to_str(value) for key, value in input.iteritems()}
    elif isinstance(input, list):
        return [cnv_to_str(element) for element in input]
    elif isinstance(input, unicode):
        return input.encode('utf-8')
    else:
        return input



def mkdir_p(path):
    try:
        os.makedirs(path)
    except OSError as exc: # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else: raise
 
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-j", "--julia", help="Full path to Julia executable", dest="julia", type=str, metavar='<path to julia>', default='julia')
    parser.add_argument("-p", "--port", help="jserver.py listen port(default 8888)", dest="port", type=int, metavar='<port>', default=8888)
    args = parser.parse_args()    
    
    http_server = tornado.httpserver.HTTPServer(application)
    http_server.listen(args.port)

    ioloop = tornado.ioloop.IOLoop.instance()

    ioloop.start()


