jdcrawler Manual 京东爬虫程序使用说明
=========

This is a web spider for JD.com, based on node.js
这是京东商品的爬虫程序,使用node.js编写

### Configuration & Usage 配置与使用

- Install **MongoDB**, more installation details for different OS please click [mongodb][1]
  首先要安装 **MongoDB** , 针对不同系统的安装详情, 请参考: [mongodb][1]
[1]: https://docs.mongodb.org/getting-started/shell/installation
- Install node.js environment, my version is 4.2.6
  安装 **node.js** 环境, 我安装的版本是4.2.6
- Run `npm install` in the directory of this project, to install all module dependencies
  在该项目目录下运行 `npm install`, 安装依赖库
- Edit **config.js**
  编辑 **config.js**

```js
   module.exports = {
       pageLength:10, //number of page crawled for each catalog每个品类抓取的页数
       dbName:"jddb", //the name of database数据库名称
       collectionName:"goods" //the collection name in database 数据库集合名称
   };

```
- Edit **catalog.xlsx**, which is the product catalog with two columns. This program will crawl JD products according to these items. You can add other catalogs into it.
  编辑 **catalog.xlsx**, 这是有两列的商品目录表,程序会根据这些项目抓取京东的商品数据, 你可以修改它增加额外的目录.
- Edit **page.txt**. This is the start index of the catalog mapped to the index in **catalog.xlsx**, which will be read when running the program each time. Default value is 0
  编辑  **page.txt**. 这是开始的目录索引, 对应着 **catalog.xlsx** 里面的序号, 程序每次启动都会预先读取该数值, 不能为空. 默认值为0
- Run `node app.js` to start the program.
  运行 `node app.js` 来启动程序

> As module **queue-async** has something wrong with npm update, this module is installed in this project in advance
  由于模块 **queue-async** 在npm update时有点小问题, 所以该模块预先安装进依赖库里面
