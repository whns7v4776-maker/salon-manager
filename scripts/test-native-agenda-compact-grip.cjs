const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/(tabs)/agenda.tsx','utf8');
const helper=source.slice(source.indexOf('const getNativeWeekResizeIndicatorHeight ='),source.indexOf('const getWebWeekResizeIndicatorHeight =')).replace('(contentHeight: number)','(contentHeight)');
const start=source.indexOf('  const resizeHandleAnimatedStyle = useAnimatedStyle(() => {');
const end=source.indexOf('  }, [appointmentKey]);',start)+'  }, [appointmentKey]);'.length;
const style=source.slice(start,end);
let checks=0;
for(const height of [23,30,40,60,120,400])for(const active of [0,1]){
 const context={IS_WEB:false,appointmentKey:'a',activeResizeKey:{value:'a'},resizeInteractionActive:{value:active},resizeHandleHeight:{value:27},resizeHeight:{value:height},useAnimatedStyle:fn=>fn()};
 vm.createContext(context);vm.runInContext(helper+style+';result=resizeHandleAnimatedStyle;',context);
 const result=context.result;
 assert.ok(result.height<=16,'active grip capped at 16 points');
 assert.ok(result.transform.every(transform=>Object.values(transform).every(scale=>scale<=1.025)),'enlargement remains subtle');
 if(active){assert.ok(result.height<=16);assert.ok(height-result.height-(result.height*.025/2)>10,'preserve information at minimum row');}
 else assert.equal(result.height,14);
 checks++;
}
console.log(`PASS ${checks} native grip geometry cases: compact rest/active size, slight scale, information clearance. Evaluates current worklet, not a gesture/device acceptance test.`);
