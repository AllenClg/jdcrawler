/*
 * GET home page.
 */

var http = require("http");
var https = require("https");
var url = require('url');
var BufferHelper = require("bufferhelper");
var xlsx = require("node-xlsx");
var fs = require("fs");
var zlib = require("zlib");
var cheerio = require("cheerio");
var queue = require("queue-async");
var querystring = require("querystring");
var logger = require("../logger.js");
var db;
var pageLength = 10;


/*路由调度函数*/
module.exports = function (app, dbTmp) {
    db = dbTmp;
    logger.disabledebug();
    app.get('/', function (req, res) {

        //res.render('home');

    });//提交产品搜索请求

    /*调度中国商品路由*/
    app.get('/feedbackCN', function (req, res) {
        //mainCN(res);
    });

};

/*-----------------------------------------------------------------------处理中国亚马逊------------------------------------------------------------------------------------------------*/
function mainCN(res) {
    logger.log('db open cn');
    db.collection("goods", function (err, collection) {
        logger.debug('get collection cn 1');
        if (err) {
            logger.debug("数据库集打开error1", err)
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
                        var obj = xlsx.parse('catalog.xlsx')[0].data;
                        var q0 = queue(1);
                        for (var i = startCatalogPosition; i < obj.length; i++) {
                            (function (i) {
                                q0.defer(function(done){
                                    var keyword = obj[i][0];
                                    var link = "http://m.jd.com/ware/searchList.action";
                                    var q1 = queue(6);
                                    for (var j = 1; j < pageLength; j++) {
                                        (function (page) {
                                            //将目前的商品种类名称写入文件
                                            fs.open("page.txt", "w", function (err, fd) {
                                                if (err) {
                                                    logger.error("write open page.txt");
                                                    return;
                                                }
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
                                                requestCN(link, keyword, page, success, function () {
                                                    logger.error("search: " + keyword + " " + "page:" + page);
                                                    done();
                                                }, res, done, crawlDetails);//发送url给美国亚马逊处理
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

//请求中国页面信息
function requestCN(link, keyword, page, success, error, res, done, callback, errorNum) {

    if (callback != undefined) {
        var contents = querystring.stringify({
            _format_: "json",
            sort: 1,
            page: page,
            keyword: keyword
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
                        //done();
                        //var $ = cheerio.load(data);
                        //if (callback == undefined) {
                        //    logger.debug("cnCrawl undefined")
                        //}
                        //callback(data, $, res, done);
                        //if (success) {
                        //    success();
                        //}
                    });
            });
        req.on('error',
            function (e) {
                if (errorNum == undefined) {
                    errorNum = 0;
                    logger.debug("1 cnrequest error, error次数", errorNum);
                    logger.debug(e)

                } else {
                    errorNum++;
                    logger.debug("1 cnrequest error, error次数", errorNum);
                    logger.debug(e)
                }
                if (errorNum > 500) {
                    logger.debug("1 cnrequest error大于30,skip", errorNum);
                    if (error) {
                        error();
                    }
                } else {
                    logger.debug("第", errorNum, "次重传");
                    requestCN(link, keyword, page, success, error, res, done, callback, errorNum)
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

    //logger.debug(result);
    toCNDb(result, res, done);
}

//处理抓取的中国页面
function crawlCNHtml(data, $, res, done, i) {

    var eventResult = [];
    var page = i;
    fs.open("page.txt", "w", function (err, fd) {
        if (err) {
            return;
        }
        fs.writeFile("page.txt", page, function (err) {
            if (err) {
                return;
            }
            fs.close(fd);
        });
    });

    if (data) {
        var length = $("tbody[id^=normalthread]").length;
        var eventArr = [];
        $("tbody[id^=normalthread]").each(function () {
            eventArr.push($(this).children("tr").find("a[class=xst]").attr("href"))
        });

        var q1 = queue(6);

        for (var i = 0; i < length; i++) {
            logger.debug("第" + i + "次循环");
            (function (i) {
                q1.defer(function (done) {
                    var eventLink = eventArr[i];
                    logger.debug("event0:", eventArr[i]);

                    //每个活动具体信息
                    requestCNDetail(eventLink, success, function () {

                        done();
                    }, function (data, jq, i) {
                        var leader = '';
                        var eventName = '';
                        var eventFeature = "";
                        var eventTime = [];

                        var eventLocation = "";
                        var eventApplyList = [];
                        var eventCommentList = [];
                        logger.debug("爬虫第" + page + "页" + "第" + i + "个活动");
                        logger.debug("---------");
                        logger.debug("event1:" + eventLink);
                        logger.debug("---------");

                        //抓取活动名称
                        if (jq("a[id=thread_subject]").length > 0) {
                            var eventNameArr = jq("a[id=thread_subject]").text().split(/[ \ \\\'\"\/\<\>\(\)\~\[\]\@\#\^\!\，\。\、\！\”\“\‘\’\；\：\（\）\"\;\:\{\}\【\】\█\●\$\*\\®\◆\★\▄\︻\┻\┳]/);
                            for (var i = 0; i < eventNameArr.length; i++) {
                                eventNameArr[i] = trim(eventNameArr[i]);
                            }
                            eventName = eventNameArr.join(" ");
                        }
                        //抓取活动开始时间
                        if (jq("div.spi dt:contains('出发时间:')").next().children("strong").first() != undefined && trim(jq("div.spi dt:contains('出发时间:')").next().children("strong").text()) != " ") {
                            eventTime[0] = jq("div.spi dt:contains('出发时间:')").next().children("strong").text();
                        }
                        //抓取活动结束时间
                        if (jq("div.spi dt:contains('返回时间:')").next().children("strong").first() != undefined && trim(jq("div.spi dt:contains('返回时间:')").next().children("strong").first().text()) != " ") {
                            eventTime[1] = jq("div.spi dt:contains('返回时间:')").next().children("strong").first().text();
                        }
                        //抓取活动地点
                        if (jq("div.spi dt:contains('活动地点:')").next() != undefined) {
                            eventLocation = jq("div.spi dt:contains('活动地点:')").next().text();
                        }
                        //抓取活动领队信息
                        if (jq("div.spi dt:contains('领队名称:')").next().children('strong').children('a').first() != undefined) {
                            leader = jq("div.spi dt:contains('领队名称:')").next().children('strong').children('a').first().text();

                        }
                        //抓取活动特色信息
                        if (jq("div.spi dt:contains('活动特色:')").next() != undefined) {
                            var eventFeatureArr = jq("div.spi dt:contains('活动特色:')").next().text().split(/[ \ \\\'\"\/\<\>\(\)\~\[\]\@\#\^\!\，\。\、\！\”\“\‘\’\；\：\（\）\"\;\:\{\}\【\】\$\*\\®\◆\★\▄\︻\\█\●┻\┳]/);
                            for (var i = 0; i < eventFeatureArr.length; i++) {
                                eventFeatureArr[i] = trim(eventFeatureArr[i]);
                            }
                            eventFeature = eventFeatureArr.join(" ");
                        }
                        logger.debug("名字:" + eventName + "\n领队:" + leader + "\n特色:" + eventFeature + "\n活动时间:" + eventTime + "\n活动地点:" + eventLocation);
                        //抓取活动报名人员信息
                        if (jq("div#box_applylist").find("tr[class='TdCenter tab_315_TdbackColor'][style='border-top:1px solid #DEDEDE;']") != undefined) {
                            jq("div#box_applylist").find("tr[class='TdCenter tab_315_TdbackColor'][style='border-top:1px solid #DEDEDE;']").each(function () {
                                if ($(this).children('td').eq(1).children("a").length > 0) {
                                    eventApplyList.push($(this).children('td').eq(1).children("a").text());
                                }
                            });
                            //去除重复信息
                            var hash = {},
                                len = eventApplyList.length,
                                result = [];
                            for (var i = 0; i < len; i++) {
                                if (!hash[eventApplyList[i]] && eventApplyList[i] != leader) {
                                    hash[eventApplyList[i]] = true;
                                    result.push(eventApplyList[i]);
                                }
                            }
                            eventApplyList = result;
                        }

                        //抓取回帖用户信息

                        if (jq("div[class=authi]").length > 0) {

                            jq("div[class=authi]").each(function () {

                                if (jq(this).children("a").first().hasClass("xw1")) {

                                    eventCommentList.push(jq(this).children("a").first().text())
                                }
                            });
                        }

                        var q2 = queue(6);
                        for (var j = 2; j < 21; j++) {
                            (function (j) {
                                q2.defer(function (done) {
                                    var linkArr = eventLink.split("-");
                                    linkArr[2] = j;
                                    var commentLink = linkArr.join("-");

                                    requestCNDetail(commentLink, success, function () {

                                        done();
                                    }, function (data, jq) {
                                        if (jq("div[class=authi]").length > 0) {

                                            jq("div[class=authi]").each(function () {

                                                if (jq(this).children("a").first().hasClass("xw1")) {

                                                    eventCommentList.push(jq(this).children("a").first().text())
                                                }
                                            });
                                        }

                                        done();
                                    })
                                })
                            }(j))
                        }
                        q2.awaitAll(function () {
                            logger.debug("--------");
                            logger.debug("爬虫第" + page + "页");
                            logger.debug("---------");
                            //评论者去重
                            var hash2 = {},
                                len2 = eventCommentList.length,
                                result2 = [];
                            for (var i = 0; i < len2; i++) {
                                if (!hash2[eventCommentList[i]] && eventCommentList[i] != leader) {
                                    hash2[eventCommentList[i]] = true;
                                    result2.push(eventCommentList[i]);
                                }
                            }
                            eventCommentList = result2;
                            for (var j = 0; j < eventCommentList.length; j++) {
                                logger.debug("--------------")
                                logger.debug(eventCommentList[j]);

                            }
                            if (trim(eventTime[0]) != "" && trim(eventTime[1]) != "" && trim(eventTime[0].split("年")[0]) > "1990" && trim(eventTime[1].split("年")[0]) > "1990") {
                                eventResult.push({
                                    "eventLink": eventLink,
                                    "eventName": eventName,
                                    "eventTime": eventTime,
                                    "eventLocation": eventLocation,
                                    "eventFeature": eventFeature,
                                    "leader": leader,
                                    "applyList": eventApplyList,
                                    "commentList": eventCommentList
                                });

                            } else {
                                logger.debug("没有活动时间")
                                if (trim(eventTime[0].split("年")[0]) <= "1990") {
                                    logger.debug("活动时间没定义")
                                }
                            }

                            done();
                        })
                    }, i);
                })
            }(i));
        }
        ;
        q1.awaitAll(function () {
            logger.debug('all done');
            if (eventResult.length > 0) {
                toCNDb(eventResult, res, page, done)
            }
            else {
                logger.debug("cnResult长度不够")
                done();
            }
        });

    }

}

//处理中国亚马逊数据库集合
function toCNDb(cnResult, res, done) {

    logger.debug('新查询开始入库');
    db.collection("goods", function (err, collection) {
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
                        logger.debug("1目录:", keyword," wname:"+wname);
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
                                    logger.debug("数据已存在,更新关键词");
                                    collection.findOne({
                                        wareId: wareId,
                                        keywords: {$elemMatch: {keyword: keyword}}
                                    }, function (err, result) {
                                        if (err) {
                                            logger.debug("database find error", 1);
                                            done();
                                        } else {
                                            if (result == null) {
                                                logger.debug("目录不存在");
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
                                                        logger.debug("数据关键词更新错误");
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
                                                                logger.debug("CN 当天价格重复了");
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
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname)
                                                                        updateNum++;
                                                                        done();
                                                                    }
                                                                })
                                                            } else {
                                                                logger.debug("当天价格没有重复");
                                                                collection.update({
                                                                    wareId: wareId,
                                                                }, {
                                                                    $addToSet: {
                                                                        prices: {
                                                                            price: price,
                                                                            date: updateTime
                                                                        }
                                                                    }
                                                                }, {safe: true}, function (err, result) {
                                                                    if (err) {
                                                                        logger.debug("更新价格页数数据更新错误")
                                                                        done()
                                                                    }
                                                                    else {
                                                                        logger.debug("更新价格页数数据更新成功")
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname)
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
                                                                        logger.debug("更新价格页数数据更新错误")
                                                                        done()
                                                                    }
                                                                    else {
                                                                        logger.debug("更新价格页数数据更新成功")
                                                                        logger.debug("wareId:", wareId, "商品名字:", wname)
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

function requestCNDetail(link, success, error, callback, i, errorNum) {
    if (callback != undefined) {
        var options = url.parse(link);
        options.headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip,deflate'
        };
        var protocol = options.protocol == 'https:' ? https : http;
        var req = protocol.get(options,
            function (res) {
                var output;
                if ((res.statusCode == 301 || res.statusCode == 302) && res.headers.location) {
                    if (url.parse(res.headers.location).hostname) {
                        requestCNDetail(res.headers.location, success, error, callback, errorNum);
                    }
                    else {
                        var urlObj = url.parse(link);
                        var redirectUrl = urlObj.protocol + '//' + urlObj.hostname + res.headers.location;
                        requestCNDetail(redirectUrl, success, error, callback, errorNum);
                    }
                    return;
                }
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
                        var data;
                        var $;
                        data = buffer.toBuffer();
                        $ = cheerio.load(data);
                        callback(data, $, i);
                        if (success) {
                            success();
                        }
                    });
            });
        req.on('error',
            function (e) {
                if (errorNum == undefined) {
                    errorNum = 0;
                    logger.debug("1 cnrequestdetail error, error次数", errorNum);
                    logger.debug(e)
                } else {
                    errorNum++;
                    logger.debug("1 cnrequestdetail error, error次数", errorNum);
                    logger.debug(e)
                }
                if (errorNum > 500) {
                    logger.debug("1 cnrequestdetail error大于30,skip", errorNum);
                    if (error) {
                        error();
                    }
                } else {
                    logger.debug("第", errorNum, "次重传");
                    logger.debug(e)
                    requestCNDetail(link, success, error, callback, errorNum);
                }
            });
        req.on('timeout', function () {
            logger.debug(2);

            logger.debug("cn detial timeout");
            req.abort();
        });
        req.setTimeout(60000);

        req.end();
    } else {
        logger.debug('requestCN detail callback undefined')
    }


}

//去除文字前后空格
function trim(str) {
    return str.replace(/(^\s*)|(\s*$)/g, "");

}

//success function
function success() {
    logger.debug("page success");
}

//error function
function error() {
    logger.debug("page error");
}

//日期
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
}
