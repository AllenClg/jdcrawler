/**
 * Created by zoomchan on 16-01-28.
 * 日志类，通过console显示
 */

var debug = false;//是否调试状态，调试状态下会显示debug类型的日志

exports.enabledebug = function () {
    debug = true;
};
exports.disabledebug = function () {
    debug = false;
};

exports.log = function (msg) {
    console.log("LOG: " + msg);
};

exports.debug = function (msg) {
    if (debug)
        console.log("DEBUG: " + msg);
};

exports.error = function (msg) {
    console.log("ERROR: " + msg);
};