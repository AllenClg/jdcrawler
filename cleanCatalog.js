///**
// * Created by user on 16/1/21.
// */
//
//var xlsx = require("node-xlsx");
//var fs = require("fs");
//var obj = xlsx.parse('b.xlsx')[0].data;
//var arr = new Array();
//var arr1 = new Array();
//var hash = {};
//
////清洗品类数据
//for(var i = 0;i<obj.length;i++){
//    if(obj[i][0]){
//        if(obj[i][0].toString().trim() != "" ){
//            var temp = obj[i][0].replace(/[&，、]/g," ").trim();
//            if(!hash[temp]){
//                hash[temp] = true;
//                arr.push(temp)
//            }
//        }
//    }
//}
//for(var j= 0;j<arr.length;j++){
//    arr1[j]=[];
//}
//for(var k = 0;k<arr.length;k++){
//    arr1[k][0] = arr[k];
//    arr1[k][1] = k;
//}
//var buffer = xlsx.build([{name: "mySheetName", data: arr1}]);
//fs.writeFileSync('catalog.xlsx', buffer, 'binary');