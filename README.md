Julia Web REPL - alternate implementation
=========================================

This project is a prototype of an alternate (simpler?) implementation for the Julia Web REPL

Simplicity is sought to be achieved by 
- using the standard julia console executable as-is for the web REPL
- using websockets instead of XMLHTTPRequest
- using termlib.js for interpreting terminal codes on the browser
- Python / Tornado for the message router


Dependencies
-------------
- NGINX version 1.3.13 or later - any other web server supporting websockets should work too, but hasn't been tested for the same.
- Tornado framework for python


Implementation
--------------
- jserver.py is the daemon managing Julia Sessions. It directs incoming messages to the right julia process.
    * Multiple users can share the same session
    * the subprocess module is used to spawn a julia process
    
- Javascript code is in html/js/REPL.js
- It uses a chat-like interface to support multiple users - i.e., a separate console for entering julia expressions just beneath the main window
- In order to identify the different users, incoming expressions are appended with a julia comment specifying the username before passing them onto the julia process. 
So, for example,
   * browser sends the expression "a=1"
   * jserver.py sends "a=1                                #<guest>" to the julia process
   * the terminal in the browser sees "julia> a=1                                #<guest>"
- the cwd of the julia process is changed to /tmp/jl_sessions/<session_name>
- any images will be created in /tmp/jl_sessions/<session_name>
- the image URLS are automatically pushed to the browser and displayed next to the terminal window.
- images in /tmp/jl_sessions/<session_name> older than 5 minutes are automatically deleted
   
   


Caveats and quirks
------------------
- currently the whole thing is more of a proof-of-concept - the code is not very resilient
- has only tested it on Ubuntu 12.10 and Chrome
- has not been tested with secure websockets (wss) which is currently a must for websocket proxy traversal




Starting the web repl
---------------------
- Default configuration listens on port 8000 for the web server and port 8888 for the julia sessions server
- change the location paths in nginc.conf appropriate to your setup. I usually create a 'run' directory at the root level and execute
  all servers from there. NOTE: the default nginx configuration creates a bunch of sub-directories. 
- Start nginx and jserver.py
- For jserver.py :

usage: jserver.py [-h] [-j <path to julia>] [-p <port>]

optional arguments:
  -h, --help            show this help message and exit
  -j <path to julia>, --julia <path to julia>
                        Full path to Julia executable
  -p <port>, --port <port>
                        jserver.py listen port(default 8888)
                        
- listen port for jserver.py must be in sync with that in nginx.conf
- point your browser at http://localhost:8000/ or whatever your configuration and you should be good to go.


