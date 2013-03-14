var DSP_wsUri = "ws://" + window.document.location.host + "/ws"; 
var DSP_term;
var DSP_input;
var DSP_ws = null;
var DSP_cmds = new Array();
var DSP_session = 'common';
var DSP_user = 'guest';
var DSP_ws_cnt = 0;


var DSP_MSG_INIT   =    'init'
var DSP_MSG_CMD    =    'cmd'
var DSP_MSG_ERROR  =    'err'
var DSP_MSG_RESP   =    'resp'
var DSP_MSG_PLOT   =    'plot' 
var DSP_MSG_ENV    =    'env' 


function DSP_termOpen() {
    if (!DSP_term) {
        DSP_term=new Terminal(
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
        if (DSP_term) DSP_term.open();
        
        DSP_input=new Terminal(
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
                handler: DSP_termHandler,
                mapANSI:true,
                frameColor : '#555555', 
                frameWidth : 4,
                ps : DSP_user + '>'
            }
        );
        if (DSP_input) DSP_input.open();
        
        TermGlobals.keylock = true;
    }
    DSP_input.wrapOff();
}

function DSP_termHandler() {
    // called on <CR> or <ENTER>
    this.newLine();
    var cmd = $.trim(this.lineBuffer);
    if (cmd != '') {
        // Send cmd to Server....
        DSP_send(cmd); 
    }
  
   this.prompt();
}



function DSP_init() {
    DSP_termOpen();

    $('#set_session').click(function(o) {
        DSP_init_ws();
    });

    $('#submit_ml').click(function(o) {
        var cmd = $("#ml_cmd").val(); 
        DSP_send($.trim(cmd));
    });

    $('#submit_ml_clear').click(function(o) {
        var cmd = $("#ml_cmd").val(); 
        $("#ml_cmd").val('');
        DSP_send($.trim(cmd));
    });

    $('#ml_clear').click(function(o) {
        $("#ml_cmd").val('');
    });
    
    
    $('#session').val(DSP_session);
    $('#user').val(DSP_user);
    
    $('#input_term').click(function () {TermGlobals.keylock = false; DSP_input.focus();})    
    $('#user').click(function () {TermGlobals.keylock = true; })    
    $('#session').click(function () {TermGlobals.keylock = true; })    
    $('#ml_cmd').click(function () {TermGlobals.keylock = true; })    
    
    TermGlobals.keylock = false; 
    DSP_input.focus();    
}  

function DSP_init_ws() {
    if (DSP_ws != null) {
        DSP_ws.close();
        DSP_ws = null;
    }
    
    DSP_ws = new WebSocket(DSP_wsUri); 
    DSP_ws_cnt++; // Just to make sure we are with the same handle upon callback
    
    var lcl_cnt = DSP_ws_cnt;
    
    DSP_ws.onopen = function(evt) { onOpen(evt, lcl_cnt) }; 
    DSP_ws.onclose = function(evt) { onClose(evt, lcl_cnt) }; 
    DSP_ws.onmessage = function(evt) { onMessage(evt, lcl_cnt) }; 
    DSP_ws.onerror = function(evt) { onError(evt, lcl_cnt) }; 
}  

function onOpen(evt, chk_cnt) { 
    if (chk_cnt != DSP_ws_cnt) return;
    
    DSP_debug("CONNECTED\n"); 

    send_obj = {};
    send_obj.type = DSP_MSG_INIT;
    send_obj.user = $('#user').val();
    send_obj.session = $('#session').val();
    send_obj.msg = '';
    
    DSP_ws.send(JSON.stringify(send_obj)); 
    
    while (DSP_cmds.length > 0) {
        msg_cmd = DSP_cmds.shift()
        DSP_ws.send(msg_cmd); 
        DSP_debug("SENT: " + msg_cmd + "\n");  
    }
    
}  


function DSP_send(cmd) 
{

//    DSP_debug("SENDING......\n");
    

    if (cmd!='') {
        // Send cmd to Server....
        if (DSP_ws == null) {
            DSP_init_ws();
        }
        
        send_obj = {};
        send_obj.type = DSP_MSG_CMD;
        send_obj.msg = [cmd];
        
        send_str = JSON.stringify(send_obj);
        
        if (DSP_ws.readyState == WebSocket.OPEN) {
            DSP_ws.send(send_str); 
            DSP_debug("SENT: " + JSON.stringify(send_str) + '\n');  
        }
        else {
            DSP_cmds.push(send_str);
            DSP_debug("QUEUED CMD: " + cmd + "\n");  
        }
    }
}


function onClose(evt, chk_cnt) { 
    if (chk_cnt != DSP_ws_cnt) return;
    DSP_debug("DISCONNECTED\n");
    DSP_ws = null;
}  

function onMessage(evt, chk_cnt) { 
    if (chk_cnt != DSP_ws_cnt) return;
    DSP_debug("RESPONSE RAW : " + evt.data + '\n'); 
    resp = JSON.parse(evt.data)
    
    if (resp.type == DSP_MSG_RESP) {
        for (m in resp.msg) {
            b64decoded = window.atob(resp.msg[m]);
            out_data = DSP_term.escapeMarkup(b64decoded); // We xpect it to be base64 encoded

            DSP_term.write(out_data);
            
            DSP_debug("RESPONSE: " + out_data + '\n'); 
        }
    }
    else if (resp.type == DSP_MSG_PLOT) {
        $('#plot_img').replaceWith('<img id="plot_img" src="' + 'plots/' + DSP_session + '/' + resp.msg + '" >');
        
        DSP_debug("PLOT: " + resp.msg + '\n'); 
    }
    else if (resp.type == DSP_MSG_ENV) {
        $('#user').val(resp.msg.user);
        $('#session').val(resp.msg.session);
        DSP_session = resp.msg.session;
        DSP_user = resp.msg.user;

        DSP_input.ps = DSP_user + '>';
        DSP_term.write("User set as : " + DSP_user);
        DSP_input.prompt();
        
        DSP_debug("DSP_MSG_ENV: " + resp.msg.user + '@' + resp.msg.session + '\n'); 
    }
    else {
        DSP_debug("Unknown type: " + resp.type + '\n'); 
    }
    
    
}  

function onError(evt, chk_cnt) { 
    if (chk_cnt != DSP_ws_cnt) return;
    DSP_debug('ERROR: ' + evt.data + '\n'); 
}  

function DSP_debug(s)
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


window.addEventListener("load", DSP_init, false);  




