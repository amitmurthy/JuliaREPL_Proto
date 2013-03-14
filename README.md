Julia Web REPL - alternate implementation
=========================================

This is a proof-of-concept of an alternate (simpler?) implementation for the Julia Web REPL

Simplicity is sought to be achieved by 
- using the standard julia console executable as-is for the web REPL
- using websockets instead of XMLHTTPRequest
- using termlib.js for interpreting terminal codes on the browser
- back-end in Tornado/Python (message router, julia sessions gateway)


Dependencies
-------------
- NGINX version 1.3.13 or later - any other web server supporting websockets should work too, but hasn't been tested for the same.
- Tornado framework for python


Implementation
--------------
- has only two small relevant files - html/js/REPL.js is javascript file while src/jserver.py is the back-end python server
- jserver.py is the process managing Julia Sessions. It directs incoming messages to the right julia process.
    * jserver.py launches a new julia process (the standard julia executable without any arguments) for each session
    * Multiple users can share the same session
    * jserver.py queues requests from different users for the same session
    * the subprocess module is used to spawn a julia process. Communication between Tornado and julia is via pipes mapped onto the stdin and stdout of the julia process.
    
- It uses a chat-like interface to support multiple users - i.e., a separate console for entering julia expressions just beneath the main window
- In order to identify the different users, incoming expressions are appended with a right-justified julia comment specifying the username before passing them onto the julia process. 

- the cwd of the julia process is changed to /tmp/jl_sessions/session_name
- any images are created in /tmp/jl_sessions/session_name if a path is not provided
- /tmp/jl_sessions/session_name is monitored for new image files and the image URLS are automatically pushed to the browser.
- images are displayed next to the terminal window.
- images in /tmp/jl_sessions/session_name older than 5 minutes are automatically deleted
   

Caveats and quirks
------------------
- currently the whole thing is more of a proof-of-concept - the code is not very resilient
- has only been tested it on Ubuntu 12.10 and Chrome
- has not been tested with secure websockets (wss) which is currently a must for websocket proxy traversal


Starting the web repl
---------------------
- Default configuration listens on port 8000 for the web server and port 8888 for the julia sessions server
- change the location paths in nginx.conf appropriate to your setup. I usually create a 'run' directory at the root level and execute
  all servers from there. NOTE: the default nginx configuration creates a bunch of sub-directories. 
- Start nginx and jserver.py
- For jserver.py :

    usage: jserver.py [-h] [-j <path to julia>] [-p <port>]

    optional arguments:
        -h, --help              show this help message and exit
        -j <path to julia>, --julia <path to julia>
                                Full path to Julia executable
        -p <port>, --port <port>
                                jserver.py listen port(default 8888)
                        
- listen port for jserver.py must be in sync with that in nginx.conf
- point your browser at http://localhost:8000/ or whatever your configuration and you should be good to go.


TODO
====
- sessions timeout on inactivity- fix it or implement a keepalive message
- Handle zombie julia processes
- Daemonize jserver.py
- Delete session directory in /tmp/jl_sessions when session closes
- Make the entire setup more resilient to error conditions

