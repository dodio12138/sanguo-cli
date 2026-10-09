window.GameClock=class GameClock {
  static isDaily(state){return Number.isInteger(state.date?.day)}
  static daysInMonth(year,month){return new Date(Date.UTC(year,month,0)).getUTCDate()}
  static isMonthEnd(state){return this.isDaily(state)?state.date.day===this.daysInMonth(state.date.year,state.date.month):state.date.xun===2}
  static isTenDayEnd(state){return this.isDaily(state)?state.date.day===10||state.date.day===20||this.isMonthEnd(state):true}
  static isQuarterEnd(state){return this.isMonthEnd(state)&&state.date.month%3===0}
  static factor(state){return this.isDaily(state)?.1:1}
  static duration(state,oldTurns){return Math.max(1,Math.round(oldTurns*(this.isDaily(state)?10:1)))}
  static legacyTurn(state){return state.policies?.dailyClock?state.policies.dailyClock.legacyTurn+(state.turn-state.policies.dailyClock.baseTurn)/10:state.turn}
  static elapsedDays(state){return state.policies?.dailyClock?state.policies.dailyClock.originDay+state.turn-state.policies.dailyClock.baseTurn:state.turn*10}
  static next(date){const result={...date,day:(date.day||1)+1};if(result.day>this.daysInMonth(result.year,result.month)){result.day=1;result.month++}if(result.month>12){result.month=1;result.year++}result.xun=Math.min(2,Math.floor((result.day-1)/10));return result}
  static migrate(save){
    if(Number.isInteger(save.date?.day))return save;
    save.date??={year:200,month:1,xun:0};save.date.day=Math.min(this.daysInMonth(save.date.year,save.date.month),(save.date.xun||0)*10+1);
    save.policies??={};save.policies.dailyClock={baseTurn:save.turn||1,legacyTurn:save.turn||1,originDay:((save.turn||1)-1)*10+1};
    const base=save.turn||1,convert=deadline=>base+(deadline-base)*10;
    const visit=value=>{if(!value||typeof value!=="object")return;for(const [key,item] of Object.entries(value)){if(["expiresTurn","injuredUntil","occupiedUntil"].includes(key)&&Number.isFinite(item))value[key]=convert(item);else if(key==="boosts"&&item&&typeof item==="object"){for(const role of Object.keys(item))if(Number.isFinite(item[role]))item[role]=convert(item[role])}else visit(item)}};
    visit(save.world);visit(save.diplomacy);
    for(const cargo of save.policies.fiscalAccounts?.shipments||[]){cargo.arriveTurn=convert(cargo.arriveTurn);cargo.edgeDays=(cargo.edgeDays||1)*10;cargo.segmentRemainingDays=(cargo.segmentRemainingDays||1)*10}
    for(const record of save.policies.eventHistory||[])record.dayStamp=(record.turn-1)*10+1;
    return save;
  }
  static chineseNumber(value){const digits="零一二三四五六七八九";if(value<10)return digits[value];if(value<20)return `十${value%10?digits[value%10]:""}`;if(value<100)return `${digits[Math.floor(value/10)]}十${value%10?digits[value%10]:""}`;return String(value)}
  static dayName(day){if(day<=10)return day===10?"初十":`初${this.chineseNumber(day)}`;if(day<20)return this.chineseNumber(day);if(day===20)return"二十";if(day<30)return`廿${this.chineseNumber(day-20)}`;return day===30?"三十":"卅一"}
  static era(date){const eras=[[184,1,"中平"],[190,1,"初平"],[194,1,"兴平"],[196,1,"建安"],[220,4,"延康"],[220,10,"黄初"],[226,1,"太和"],[233,1,"青龙"],[237,4,"景初"],[240,1,"正始"],[249,1,"嘉平"],[254,10,"正元"],[256,6,"甘露"],[260,6,"景元"],[264,6,"咸熙"],[265,12,"泰始"],[275,1,"咸宁"],[280,1,"太康"]],index=date.year*12+date.month;const chosen=eras.filter(([year,month])=>year*12+month<=index).at(-1);if(!chosen||date.year>289)return `${date.year}年`;const year=date.year-chosen[0]+1;return `${chosen[2]}${year===1?"元":this.chineseNumber(year)}年`}
  static sexagenary(index){const value=((index%60)+60)%60;return "甲乙丙丁戊己庚辛壬癸"[value%10]+"子丑寅卯辰巳午未申酉戌亥"[value%12]}
  static yearStem(date){return this.sexagenary(date.year-4)}
  static dayStem(date){const epoch=Date.UTC(2000,0,7),day=Date.UTC(date.year,date.month-1,date.day||1);return this.sexagenary(Math.round((day-epoch)/86400000))}
};
