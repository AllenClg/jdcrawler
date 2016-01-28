/**
 * Module dependencies.
 */
var config = require("./config.js");
var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var https = require("https");
var url = require('url');
var app = express();
var BufferHelper = require("bufferhelper");
var fs = require("fs");
var zlib = require("zlib");
//var cheerio = require("cheerio");
var queue = require("queue-async");
var mongodb = require('mongodb');
var server = new mongodb.Server('localhost', 27017, {auto_reconnect: true});
var db = new mongodb.Db(config.dbName, server, {safe: true});
var xlsx = require("node-xlsx");
var querystring = require("querystring");
var logger = require("./logger.js");
var pageLength = config.pageLength;
var collectionName = config.collectionName;

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.urlencoded());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));


// development only
if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

db.open(function (err, db) {
    if (!err) {
        http.createServer(app).listen(app.get('port'), function () {
            logger.log('Express server listening on port ' + app.get('port'));
            logger.log((new Date()).Format("yyyy-MM-dd hh:mm"));
            logger.disabledebug();//关闭log
            routes(app, db);
            main(null);
        });
    }
});

//main function
function main(res) {
    logger.log('db open');
    db.collection(collectionName, function (err, collection) {
        logger.debug('get collection goods');
        if (err) {
            logger.debug("数据库集打开error", err)
        } else {
            logger.debug("没有这个查询,需要入库");
            var startCatalogPosition = '';
            fs.open("page.txt", "r", function (err, fd) {
                if (err) {
                    return;
                }
                fs.readFile("page.txt", function (err, data) {
                    if (err) {
                        return;
                    } else {
                        startCatalogPosition = data.toString();
                        fs.close(fd);
                        var obj = xlsx.parse('catalog.xlsx')[0].data;//读取预先定义的品类
                        //最外层商品品类队列
                        var q0 = queue(1);
                        for (var i = startCatalogPosition; i < obj.length; i++) {
                            (function (i) {
                                q0.defer(function(done){
                                    var keyword = obj[i][0];
                                    var link = "http://m.jd.com/ware/searchList.action";
                                    var q1 = queue(4);//每个品类并发处理页码的队列
                                    for (var j = 1; j < pageLength; j++) {
                                        (function (page) {
                                            //将目前的商品种类序号写入文件
                                            fs.open("page.txt", "w", function (err, fd) {
                                                if (err) {
                                                    logger.error("write open page.txt");
                                                    return;
                                                }
                                                //写入目前品类的序号
                                                fs.writeFile("page.txt", i, function (err) {
                                                    if (err) {
                                                        logger.error("write open page.txt");
                                                        return;
                                                    }
                                                    fs.close(fd);
                                                });
                                            });
                                            q1.defer(function (done) {
                                                logger.debug("search: " + keyword + " " + "page:" + page);
                                                sendRequest(link, keyword, page, success, function () {
                                                    logger.error("search: " + keyword + " " + "page:" + page);
                                                    done();
                                                }, res, done, crawlDetails);//发送url给JD
                                            })
                                        }(j))
                                    }
                                    q1.awaitAll(function () {
                                        logger.log(keyword + " 结束");
                                        done();
                                    })
                                });

                            }(i))
                        }
                        q0.awaitAll(function () {
                            logger.log("all结束");
                        })
                    }
                })
            })
        }
    })
}

//请求jd页面信息
function sendRequest(link, keyword, page, success, error, res, done, callback, errorNum) {

    if (callback != undefined) {
        //get请求的参数
        var contents = querystring.stringify({
            _format_: "json",
            sort: 1,//按销量排序
            page: page,//查询的页码
            keyword: keyword //搜索的品类目录
        });
        logger.debug(contents);
        var options = url.parse(link);
        var reqOptions = {
            keyword: keyword,
            page: page,
            sort: 1
        };
        //proxy
        //options.hostname = options.host = '127.0.0.1';
        //options.port = '8888';
        options.path = "http://m.jd.com/ware/searchList.action?" + contents;
        options.method = "get";
        options.headers = {
            "Host": "m.jd.com",
            "Connection": "keep-alive",
            "Pragma": "no-cache",
            "Cache-Control": "no-cache",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.111 Safari/537.36",
            "Accept-Encoding": "gzip, deflate, sdch",
            "Accept-Language": "zh-CN,zh;q=0.8,und;q=0.6"
        };
        var protocol = options.protocol == 'https:' ? https : http;
        var req = protocol.get(options,
            function (res) {
                var output;
                switch (res.headers['content-encoding']) {
                    case 'gzip':
                        var gzip = zlib.createGunzip();
                        res.pipe(gzip);
                        output = gzip;
                        break;
                    case 'deflate':
                        var gzip = zlib.createInflate();
                        res.pipe(gzip);
                        output = gzip;
                        break;
                    default:
                        output = res;
                        break;
                }
                var buffer = new BufferHelper();
                output.on('data',
                    function (chunk) {
                        buffer.concat(chunk);
                    });
                output.on('end',
                    function () {
                        var data = buffer.toBuffer().toString();
                        logger.debug("data:"+data);
                        if (data == undefined || JSON.parse(data) == undefined) {
                            logger.error("data undefined");
                            done();
                            return;
                        }
                        var goods = JSON.parse(JSON.parse(data).value);
                        logger.debug(goods);
                        callback(goods, reqOptions, res, done);
                    });
            });
        req.on('error',
            function (e) {
                if (errorNum == undefined) {
                    errorNum = 0;
                    logger.debug("sendRequest error, error次数", errorNum);
                    logger.debug(e)

                } else {
                    errorNum++;
                    logger.debug("sendRequest error, error次数", errorNum);
                    logger.debug(e)
                }
                if (errorNum > 500) {
                    logger.debug("sendRequest error error大于30,skip", errorNum);
                    if (error) {
                        error();
                    }
                } else {
                    logger.debug("第", errorNum, "次重传");
                    sendRequest(link, keyword, page, success, error, res, done, callback, errorNum)
                }

            });
        req.on('timeout', function () {
            logger.debug("cn timeout");
            req.abort();
        });
        req.setTimeout(30000);
        req.end();
    } else {
        logger.debug("cnCrawl undefined 2");
        done();
    }
}

function crawlDetails(goods, reqOptions, res, done) {
    if (goods.wareCount == undefined || goods.wareList == undefined || goods.wareCount == 0 || goods.wareList.length == 0) {
        logger.debug("该页没有商品," + goods);
        done();
        return;
    }
    var date = (new Date()).Format("yyyy-MM-dd hh:mm");
    var goodsList = goods.wareList;
    var result = [];
    for (var i = 0; i < goodsList.length; i++) {
        var rank = (reqOptions.page - 1) * 10 + i;
        var keyword = reqOptions.keyword;
        result.push({
            wname: goodsList[i].wname,
            wareId: goodsList[i].wareId,
            totalCount: goodsList[i].totalCount,
            imgUrl: goodsList[i].longImgUrl,
            price: goodsList[i].jdPrice,
            good: goodsList[i].good,
            shopName: goodsList[i].shopName,
            updateTime: date,
            rank: rank,
            keyword: keyword,
            url: "http://item.jd.com/"+goodsList[i].wareId+".html"
        })
    }
    toDB(result, res, done);
}

//处理jd数据库集合
function toDB(cnResult, res, done) {
    logger.debug('新查询开始入库');
    db.collection(collectionName, function (err, collection) {
        if (err) {
            logger.debug("goods数据库集打开error", err);
            done();
        } else {
            var insertNum = 0;
            var updateNum = 0;
            var q3 = queue(1);
            for (var i = 0; i < cnResult.length; i++) {
                (function (i) {
                    q3.defer(function (done) {
                        var wname = cnResult[i].wname;
                        var wareId = cnResult[i].wareId;
                        var totalCount = cnResult[i].totalCount;
                        var imgUrl = cnResult[i].imgUrl;
                        var price = cnResult[i].price;
                        var good = cnResult[i].good;
                        var shopName = cnResult[i].shopName;
                        var updateTime = cnResult[i].updateTime;
                        var rank = cnResult[i].rank;
                        var keyword = cnResult[i].keyword;
                        var url = cnResult[i].url;
                        logger.debug("目录:", keyword," wname:"+wname);
                        collection.findOne({wareId: wareId}, function (err, result) {
                            if (err) {
                                logger.debug("匹配错误", err);
                                done();
                            } else {
                                if (result == null) {
                                    logger.debug("数据不存在,插入数据");
                                    logger.debug("目录:", keyword);
                                    collection.insert({
                                        wname: wname,
                                        wareId: wareId,
                                        url: url,
                                        totalCount: totalCount,
                                        imgUrl: imgUrl,
                                        prices: [
                                            {price: price, date: updateTime}
                                        ],
                                        good: good,
                                        shopName: shopName,
                                        keywords: [
                                            {keyword: keyword, rank: rank, date: updateTime}
                                        ]
                                    }, function (err, result) {
                                        if (err) {
                                            logger.debug("数据导入错误:",err);
                                            done()
                                        }
                                        else {
                                            logger.debug("插入后数据", result);
                                            insertNum++;
                                            done();
                                        }
                                    })
                                } else {
                                    logger.debug("数据已存在,更新目录");
                                    collection.findOne({
                                        wareId: wareId,
                                        keywords: {$elemMatch: {keyword: keyword}}
                                    }, function (err, result) {
                                        if (err) {
                                            logger.debug("database find error", 1);
                                            done();
                                        } else {
                                            if (result == null) {
                                                logger.debug("目录不存在,插入新目录");
                                                logger.debug("目录:", keyword);
                                                collection.update({wareId: wareId}, {
                                                    $addToSet: {
                                                        keywords:{
                                                            keyword: keyword,
                                                            rank: rank,
                                                            date: updateTime
                                                        }
                                                    }
                                                }, function (err, result) {
                                                    if (err) {
                                                        logger.debug("新目录关键词和排名插入错误");
                                                        done()
                                                    }
                                                    else {
                                                        logger.debug("推入新关键词和目录数据成功");
                                                        logger.debug("wareId:", wareId, "商品名字:", wname);
                                                        collection.findOne({
                                                            wareId: wareId
                                                        }, function (err, result) {
                                                            var lastIndex = result.prices.length - 1;
                                                            logger.debug("lastindex", lastIndex);
                                                            if (result.prices[lastIndex].date.split(' ')[0] == updateTime.split(' ')[0]) {
                                                                logger.debug("当天价格重复了");
                                                                collection.update({
                                                                    wareId: wareId,
                                                                    "prices.date": result.prices[lastIndex].date
                                                                }, {
                                                                    $set: {
                                                                        "prices.$.date": updateTime,
                                                                        "prices.$.price": price
                                                                    }
                                                                }, {safe: true}, function (err, result) {
                                                                    if (err) {
                                                                        logger.debug("更新价格页数数据更新错误");
                                                                        done();
                                                                    }
                                                                    else {
                                                                        logger.debug("更新价格页数数据更新成功");
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname);
                                                                        updateNum++;
                                                                        done();
                                                                    }
                                                                })
                                                            } else {
                                                                logger.debug("当天价格没有重复");
                                                                collection.update({
                                                                    wareId: wareId
                                                                }, {
                                                                    $addToSet: {
                                                                        prices: {
                                                                            price: price,
                                                                            date: updateTime
                                                                        }
                                                                    }
                                                                }, {safe: true}, function (err, result) {
                                                                    if (err) {
                                                                        logger.debug("更新价格页数数据更新错误");
                                                                        done()
                                                                    }
                                                                    else {
                                                                        logger.debug("更新价格页数数据更新成功");
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname);
                                                                        updateNum++;
                                                                        done();
                                                                    }
                                                                })
                                                            }
                                                        })
                                                    }
                                                })
                                            } else {
                                                logger.debug("目录都已存在");
                                                logger.debug("目录:", keyword);
                                                collection.update({
                                                    wareId: wareId,
                                                    keywords: {$elemMatch: {keyword: keyword}}
                                                }, {
                                                    $set: {
                                                        "keywords.$.rank": rank,
                                                        "keywords.$.date": updateTime
                                                    }
                                                }, {safe: true}, function (err, result) {
                                                    if (err) {
                                                        logger.debug("页数数据更新错误");
                                                        done()
                                                    }
                                                    else {
                                                        logger.debug("页数数据更新成功");
                                                        logger.debug("wareId:", wareId, "商品名字:", wname);
                                                        collection.findOne({
                                                            wareId: wareId
                                                        }, function (err, result) {
                                                            var lastIndex = result.prices.length - 1;
                                                            logger.debug("lastindex", lastIndex);
                                                            if (result.prices[lastIndex].date.split(' ')[0] == updateTime.split(' ')[0]) {
                                                                logger.debug("当天价格重复了");
                                                                collection.update({
                                                                    wareId: wareId,
                                                                    "prices.date": result.prices[lastIndex].date
                                                                }, {
                                                                    $set: {
                                                                        "prices.$.date": updateTime,
                                                                        "prices.$.price": price
                                                                    }
                                                                }, {safe: true}, function (err, result) {
                                                                    if (err) {
                                                                        logger.debug("更新价格页数数据更新错误");
                                                                        done()
                                                                    }
                                                                    else {
                                                                        logger.debug("更新价格页数数据更新成功");
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname);
                                                                        updateNum++;
                                                                        done();
                                                                    }
                                                                })
                                                            } else {
                                                                logger.debug("cn当天价格没有重复");
                                                                collection.update({
                                                                    wareId: wareId
                                                                }, {
                                                                    $addToSet: {
                                                                        prices: {
                                                                            price: price,
                                                                            date: updateTime
                                                                        }
                                                                    }
                                                                }, {safe: true}, function (err, result) {
                                                                    if (err) {
                                                                        logger.debug("更新价格页数数据更新错误");
                                                                        done()
                                                                    }
                                                                    else {
                                                                        logger.debug("更新价格页数数据更新成功");
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname);
                                                                        updateNum++;
                                                                        done();
                                                                    }
                                                                })
                                                            }
                                                        });
                                                    }
                                                })
                                            }
                                        }
                                    })
                                }
                            }
                        })
                    })
                }(i))
            }
            q3.awaitAll(function () {
                logger.debug("入库成功", "新增加数据量:", insertNum);
                logger.debug("更新的数量为:", updateNum);
                done();
            })
        }
    })
}

Date.prototype.Format = function (fmt) { //author: meizz
    var o = {
        "M+": this.getMonth() + 1,                 //月份
        "d+": this.getDate(),                    //日
        "h+": this.getHours(),                   //小时
        "m+": this.getMinutes(),                 //分
        "s+": this.getSeconds(),                 //秒
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度
        "S": this.getMilliseconds()             //毫秒
    };
    if (/(y+)/.test(fmt))
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt))
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
};


//去除文字前后空格
function trim(str) {
    return str.replace(/(^\s*)|(\s*$)/g, "");

}

//success function
function success() {
    logger.debug("success");
}

//error function
function error() {
    logger.debug("error");
}
