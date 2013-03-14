var REPL_wsUri = "ws://" + window.document.location.host + "/ws"; 
var REPL_term;
var REPL_input;
var REPL_ws = null;
var REPL_cmds = new Array();
var REPL_session = 'common';
var REPL_user = 'guest';
var REPL_ws_cnt = 0;


var REPL_MSG_INIT   =    'init'
var REPL_MSG_CMD    =    'cmd'
var REPL_MSG_ERROR  =    'err'
var REPL_MSG_RESP   =    'resp'
var REPL_MSG_PLOT   =    'plot' 
var REPL_MSG_ENV    =    'env' 


function REPL_termOpen() {
    if (!REPL_term) {
        REPL_term=new Terminal(
            {
                x: 0,
                y: 0,
                cols: 100,
                rows: 26,
                rowHeight : 15,
                historyUnique : true,
                greeting: 'Julia Console',
                id: 1,
                termDiv: 'terminal',
                crsrBlinkMode: true,
                mapANSI:true,
                frameColor : '#555555', 
                frameWidth : 4,
                ps : ''
            }
        );
        if (REPL_term) REPL_term.open();
        
        REPL_input=new Terminal(
            {
                x: 0,
                y: 0,
                cols: 100,
                rows: 6,
                rowHeight : 15,
                historyUnique : true,
                greeting: 'Welcome. Enter any Julia expression below.',
                id: 2,
                termDiv: 'input_term',
                crsrBlinkMode: true,
                handler: REPL_termHandler,
                mapANSI:true,
                frameColor : '#555555', 
                frameWidth : 4,
                ps : REPL_user + '>'
            }
        );
        if (REPL_input) REPL_input.open();
        
        TermGlobals.keylock = true;
    }
    REPL_input.wrapOff();
}

function REPL_termHandler() {
    // called on <CR> or <ENTER>
    this.newLine();
    var cmd = $.trim(this.lineBuffer);
    if (cmd != '') {
        // Send cmd to Server....
        REPL_send(cmd); 
    }
  
   this.prompt();
}



function REPL_init() {
    REPL_termOpen();

    $('#set_session').click(function(o) {
        REPL_init_ws();
    });

    $('#submit_ml').click(function(o) {
        var cmd = $("#ml_cmd").val(); 
        REPL_send($.trim(cmd));
    });

    $('#submit_ml_clear').click(function(o) {
        var cmd = $("#ml_cmd").val(); 
        $("#ml_cmd").val('');
        REPL_send($.trim(cmd));
    });

    $('#ml_clear').click(function(o) {
        $("#ml_cmd").val('');
    });
    
    
    $('#session').val(REPL_session);
    $('#user').val(REPL_user);
    
    $('#input_term').click(function () {TermGlobals.keylock = false; REPL_input.focus();})    
    $('#user').click(function () {TermGlobals.keylock = true; })    
    $('#session').click(function () {TermGlobals.keylock = true; })    
    $('#ml_cmd').click(function () {TermGlobals.keylock = true; })    
    
    TermGlobals.keylock = false; 
    REPL_input.focus();    
}  

function REPL_init_ws() {
    if (REPL_ws != null) {
        REPL_ws.close();
        REPL_ws = null;
    }
    
    REPL_ws = new WebSocket(REPL_wsUri); 
    REPL_ws_cnt++; // Just to make sure we are with the same handle upon callback
    
    var lcl_cnt = REPL_ws_cnt;
    
    REPL_ws.onopen = function(evt) { onOpen(evt, lcl_cnt) }; 
    REPL_ws.onclose = function(evt) { onClose(evt, lcl_cnt) }; 
    REPL_ws.onmessage = function(evt) { onMessage(evt, lcl_cnt) }; 
    REPL_ws.onerror = function(evt) { onError(evt, lcl_cnt) }; 
}  

function onOpen(evt, chk_cnt) { 
    if (chk_cnt != REPL_ws_cnt) return;
    
    REPL_debug("CONNECTED\n"); 

    send_obj = {};
    send_obj.type = REPL_MSG_INIT;
    send_obj.user = $('#user').val();
    send_obj.session = $('#session').val();
    send_obj.msg = '';
    
    REPL_ws.send(JSON.stringify(send_obj)); 
    
    while (REPL_cmds.length > 0) {
        msg_cmd = REPL_cmds.shift()
        REPL_ws.send(msg_cmd); 
        REPL_debug("SENT: " + msg_cmd + "\n");  
    }
    
}  


function REPL_send(cmd) 
{

//    REPL_debug("SENDING......\n");
    

    if (cmd!='') {
        // Send cmd to Server....
        if (REPL_ws == null) {
            REPL_init_ws();
        }
        
        send_obj = {};
        send_obj.type = REPL_MSG_CMD;
        send_obj.msg = [cmd];
        
        send_str = JSON.stringify(send_obj);
        
        if (REPL_ws.readyState == WebSocket.OPEN) {
            REPL_ws.send(send_str); 
            REPL_debug("SENT: " + JSON.stringify(send_str) + '\n');  
        }
        else {
            REPL_cmds.push(send_str);
            REPL_debug("QUEUED CMD: " + cmd + "\n");  
        }
    }
}


function onClose(evt, chk_cnt) { 
    if (chk_cnt != REPL_ws_cnt) return;
    REPL_debug("DISCONNECTED\n");
    REPL_ws = null;
}  

function onMessage(evt, chk_cnt) { 
    if (chk_cnt != REPL_ws_cnt) return;
    REPL_debug("RESPONSE RAW : " + evt.data + '\n'); 
    resp = JSON.parse(evt.data)
    
    if (resp.type == REPL_MSG_RESP) {
        for (m in resp.msg) {
            b64decoded = window.atob(resp.msg[m]);
            out_data = REPL_term.escapeMarkup(b64decoded); // We xpect it to be base64 encoded

            REPL_term.write(out_data);
            
            REPL_debug("RESPONSE: " + out_data + '\n'); 
        }
    }
    else if (resp.type == REPL_MSG_PLOT) {
        $('#plot_img').replaceWith('<img id="plot_img" src="' + 'plots/' + REPL_session + '/' + resp.msg + '" >');
        
        REPL_debug("PLOT: " + resp.msg + '\n'); 
    }
    else if (resp.type == REPL_MSG_ENV) {
        $('#user').val(resp.msg.user);
        $('#session').val(resp.msg.session);
        REPL_session = resp.msg.session;
        REPL_user = resp.msg.user;

        REPL_input.ps = REPL_user + '>';
        REPL_term.write("User set as : " + REPL_user);
        REPL_input.prompt();
        
        REPL_debug("REPL_MSG_ENV: " + resp.msg.user + '@' + resp.msg.session + '\n'); 
    }
    else {
        REPL_debug("Unknown type: " + resp.type + '\n'); 
    }
    
    
}  

function onError(evt, chk_cnt) { 
    if (chk_cnt != REPL_ws_cnt) return;
    REPL_debug('ERROR: ' + evt.data + '\n'); 
}  

function REPL_debug(s)
{
    return;
    
    var dbg = $('#debug');
    dbg.append(s);    
    dbg.scrollTop(dbg[0].scrollHeight - dbg.height());    
}

function lstrip(s, pfx) {
    var pos = 0;

    s += "";
    pos = s.indexOf(pfx); 
    if (pos == -1) {
        return s;
    } else {
        return s.slice(pos + pfx.length);
    }
}


window.addEventListener("load", REPL_init, false);  




