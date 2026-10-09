window.SANGUO_COMMAND_CATALOG = (() => {
  const categoryDescriptions={personnel:"管理人才的发现、归属、奖惩与宝物",office:"调整武将官职与核心幕府职位",organization:"建立和调整跨城市军团组织",domestic:"发展城市、人口、治安与常备兵力",construction:"建设或修复城市和交通设施",finance:"交易粮食并调整钱粮和税率",logistics:"组织运输、仓储、民夫与补给线",military:"建立、调整、补充或集结军团",march:"命令军团移动并改变行军状态",diplomacy:"与其他势力建立、改变或终止关系",intelligence:"获取城市、军队、人物和路线情报",strategy:"削弱敌方城市、人物或势力稳定",policy:"设定势力长期发展与授权方针",technology:"研究、改革并推广势力技术",relationship:"经营己方人物之间的关系",personal:"安排人物学习、训练、旅行或休整"};
  const details={
    search_talent:"派人搜索据点周边未出仕人物；发现者会加入可登庸名单",recruit_officer:"游说指定在野、已发现或被俘人物加入己方；俘虏可能拒绝",release_prisoner:"释放己方关押的指定俘虏；若其原势力仍存，可改善双方关系",poach_officer:"派人策动敌方在职武将倒戈，结果受忠诚与关系影响",transfer_officer:"将己方武将调往另一座己方城市任职",recall_officer:"召回外派或在外执行任务的己方武将",exile_officer:"解除指定武将的己方身份，使其离开势力",reward_officer:"赏赐己方武将以提高其忠诚",punish_officer:"惩处己方武将，压低其忠诚并可能引发后续风险",grant_item:"把己方未持有者的宝物授予指定武将",confiscate_item:"从持有者处收回其宝物并归入己方库存",
    appoint_office:"为己方武将任命具体官职，调整其身份与职责",dismiss_office:"免去指定武将当前官职，但不改变其所属势力",promote_office:"提升指定武将的官职等级",demote_office:"下调指定武将的官职等级",designate_heir:"指定君主继承人，明确势力继承顺序",set_advisor:"任命己方武将为军师，供政务与决策参考",
    create_corps:"以负责人、所属军队和辖区城市建立军团编制",disband_corps:"撤销指定军团组织；所属城市与军队回归常规管理",adjust_jurisdiction:"将指定己方城市划入军团辖区，调整其管理范围",set_leader:"更换军团负责人，由指定己方武将统辖",
    agriculture:"督查劝农官，令农业自然增长速度提高六十日",commerce:"督查市曹，令商业自然增长速度提高六十日",public_order:"督查功曹，令治安自然改善速度提高六十日",population:"清查户籍，令人口恢复速度提高六十日",city_defense:"督修城防，令城防损伤恢复速度提高六十日",recruit_troops:"提高城市守军目标并督促兵曹每十日征募，速度取决于任官能力",train_troops:"督练驻城军团六十日，训练速度取决于督练官能力",collect_tax:"向指定城市征收税款，取得收入并承担民心影响",
    construct_building:"在指定城市选择并建造设施，按建筑类型消耗资源",repair:"修复受损设施或城防，恢复其可用状态",build_road:"连接两座己方城市修建道路，改善往来与运输",build_warehouse:"在指定城市建造仓库，提升储粮与物资存放能力",fortify:"加固指定城市城墙与防御工事",waterworks:"修建水利设施，改善农业灌溉与相关产出",
    buy_food:"按指定数量购入粮食，消耗资金补充库存",sell_food:"出售指定数量的粮食换取资金",transfer_gold:"将指定金额从一座己方城市调拨至另一座",transfer_food:"将指定数量的粮食在两座己方城市间转运",set_tax_rate:"设定己方税率；税收与民心将受税率共同影响",
    transport:"将指定数量的物资从起点城市运往目标城市",establish_supply_route:"在两座己方城市间设置常态补给线，供后续运输使用",set_storage:"设定城市仓储保留比例，决定可调出物资的余量",requisition_labor:"征用指定城市民夫投入工程或后勤，影响当地民生",
    form_army:"从指定城市守军抽调兵力，任命主将并组建新军",reorganize_army:"调整指定军队的兵种编成、阵型或战术",return_garrison:"将指定军队的士兵并回所在城市守军",disband_army:"撤销指定军队编制，将可归还兵力交回驻地",reinforce:"从所在城市补充兵员，恢复指定军队规模",redeploy:"命令指定军队前往目标据点调防或驻扎",assemble:"命令指定军队向目标据点集结，为后续行动集中兵力",
    move:"沿可通行路线向目标据点行军，按常规速度推进",forced_march:"以额外补给消耗换取更快行军，部队战斗状态可能受影响",camp:"就地扎营并暂停推进，利用休整恢复补给与士气",ambush:"令军队进入伏击姿态，在适合地点等待敌军经过",raid:"派军队袭扰敌方据点，夺取物资并可能激化敌对",explore:"派军队探索周边区域，搜集道路、地形或据点信息",retreat:"命令军队沿安全方向撤离当前目标或交战区域",
    improve_relations:"向目标势力示好，尝试改善双方外交关系",non_aggression:"与目标势力缔结互不侵犯约定，降低短期冲突风险",alliance:"与目标势力建立同盟，形成正式协作关系",coalition:"邀请势力加入针对共同敌人的联军行动",declare_war:"对目标势力宣战，建立战争状态后方可主动攻伐",truce:"与交战势力议定停战，在约定期内暂停敌对行动",seek_peace:"向交战势力提出和议，尝试结束战争状态",demand_surrender:"要求弱势目标势力投降并接受己方支配",vassalize:"要求目标势力成为附庸，保留名义政权并接受宗主约束",request_reinforcements:"向友好势力请求派兵支援指定己方城市",request_war_entry:"请求盟友加入针对指定势力的战争",exchange_land:"与目标势力协商交换指定城市，改变双方领土归属",exchange_gold:"与目标势力协商指定金额的资金往来",exchange_food:"与目标势力协商指定数量的粮食往来",political_marriage:"安排双方人物联姻，以婚姻关系巩固外交联系",
    scout_city:"派遣人员侦察目标城市，查明守军、城防或储备情报",scout_army:"追查指定敌军的兵力、将领与行军状态",investigate_person:"调查目标人物的身份、能力、忠诚或所在状况",investigate_route:"勘察两地之间的道路通行与沿途风险",investigate_terrain:"调查目标区域的地形特征及其行军、作战影响",counterintelligence:"加强己方防谍布置，降低敌方侦察与渗透成功机会",
    sow_discord:"离间目标势力中的人物关系，削弱其协作与忠诚",bribe:"以金钱收买敌方人物，尝试换取合作或动摇其立场",incite:"煽动目标城市民众不满，扰乱敌方统治秩序",establish_inside_contact:"在敌方内部发展内应，为情报或后续行动铺路",sabotage:"破坏敌方城市设施或军备，削弱其生产与防守",spread_rumor:"散布针对目标人物或势力的谣言，损害声望与信任",instigate_defection:"策动敌方人物或守军倒戈，尝试改变其效忠对象",
    set_development_policy:"设定农业、商业等长期发展重点，影响后续治理倾向",set_military_goal:"指定敌方城市或区域为战略目标，供军令与 AI 规划参考",set_diplomatic_policy:"确定亲善、结盟或观望等外交倾向",set_fiscal_policy:"设定财政取向，在收入、储备与支出间确定优先级",set_authority:"设置 AI 或军团可自行处理的命令范围与审批边界",
    research:"投入科技点研究指定技术，提升对应领域等级",reform:"推行制度改革，改变势力治理或军政规则",promote_technology:"向指定城市推广已掌握技术，使成果逐步普及",
    visit:"派己方人物拜访另一人物，建立或改善个人关系",banquet:"设宴款待指定人物，增进亲近与交往",give_gift:"赠送礼物给目标人物，改善双方好感",sworn_brotherhood:"促成两名人物结为义兄弟，建立长期人际纽带",marriage:"安排两名人物成婚，建立家族与政治关系",recommend:"由己方人物举荐另一人物，推动其获得任用机会",
    study:"安排人物研习指定内容，积累知识或提升相关能力",personal_training:"安排人物进行个人训练，锻炼其能力或体能",travel:"派人物前往指定城市，执行出行或拜访安排",personal_investigation:"由人物亲自调查指定城市，获取个人任务所需信息",rest:"让人物休息恢复精力，暂缓其他个人行动"
  };
  window.SANGUO_COMMAND_DESCRIPTION=(id,name,categoryId)=>`${name}：${details[id]||categoryDescriptions[categoryId]||"将该行动加入本日命令队列"}。`;
  const groups={
    personnel:["人事",[["search_talent","搜索人才"],["recruit_officer","登庸"],["release_prisoner","释放俘虏"],["poach_officer","挖角"],["transfer_officer","调任"],["recall_officer","召回"],["exile_officer","放逐"],["reward_officer","赏赐"],["punish_officer","惩罚"],["grant_item","授予宝物"],["confiscate_item","没收宝物"]]],
    office:["官职",[["appoint_office","任命"],["dismiss_office","罢免"],["promote_office","升官"],["demote_office","降职"],["designate_heir","指定继承人"],["set_advisor","设置军师"]]],
    organization:["组织",[["create_corps","新建军团"],["disband_corps","解散军团"],["adjust_jurisdiction","调整辖区"],["set_leader","设置负责人"]]],
    domestic:["内政",[["agriculture","督查农业"],["commerce","督查商业"],["public_order","督查治安"],["population","清查户籍"],["city_defense","督修城防"],["recruit_troops","定额征兵"],["train_troops","督练军伍"],["collect_tax","征税"]]],
    construction:["建设",[["construct_building","建筑"],["repair","修缮"],["build_road","道路"],["build_warehouse","仓库"],["fortify","城防"],["waterworks","水利"]]],
    finance:["财政",[["buy_food","买粮"],["sell_food","卖粮"],["transfer_gold","调拨资金"],["transfer_food","调拨粮食"],["set_tax_rate","调整税率"]]],
    logistics:["后勤",[["transport","运输"],["establish_supply_route","建立补给路线"],["set_storage","设置仓储"],["requisition_labor","征用民夫"]]],
    military:["军事",[["form_army","编军"],["reorganize_army","改编"],["return_garrison","归还驻军"],["disband_army","解散"],["reinforce","补员"],["redeploy","调兵"],["assemble","集结"]]],
    march:["行军",[["move","移动"],["forced_march","急行军"],["camp","扎营"],["ambush","伏击"],["raid","掠夺"],["explore","探索"],["retreat","撤退"]]],
    diplomacy:["外交",[["improve_relations","亲善"],["non_aggression","互不侵犯"],["alliance","同盟"],["coalition","联军"],["declare_war","宣战"],["truce","停战"],["seek_peace","求和"],["demand_surrender","劝降"],["vassalize","附庸"],["request_reinforcements","请求援军"],["request_war_entry","请求参战"],["exchange_land","土地交换"],["exchange_gold","金钱交换"],["exchange_food","粮食交换"],["political_marriage","联姻"]]],
    intelligence:["情报",[["scout_city","城市侦察"],["scout_army","军队侦察"],["investigate_person","人物调查"],["investigate_route","路线调查"],["investigate_terrain","地形调查"],["counterintelligence","反间谍"]]],
    strategy:["谋略",[["sow_discord","离间"],["bribe","收买"],["incite","煽动"],["establish_inside_contact","内通"],["sabotage","破坏"],["spread_rumor","散布谣言"],["instigate_defection","策反"]]],
    policy:["政策",[["set_development_policy","制定发展方针"],["set_military_goal","设置军事目标"],["set_diplomatic_policy","设置外交方针"],["set_fiscal_policy","设置财政方针"],["set_authority","设置授权范围"]]],
    technology:["科技",[["research","研究"],["reform","改革"],["promote_technology","技术推广"]]],
    relationship:["人际",[["visit","拜访"],["banquet","宴请"],["give_gift","赠礼"],["sworn_brotherhood","结义"],["marriage","婚姻"],["recommend","推荐"]]],
    personal:["个人",[["study","学习"],["personal_training","训练"],["travel","旅行"],["personal_investigation","调查"],["rest","休息"]]]
  };
  const active=new Set(Object.values(groups).flatMap(([,items])=>items.map(([id])=>id))),commands=[];
  for(const [categoryId,[categoryName,items]] of Object.entries(groups))for(const [id,name] of items)commands.push({id,categoryId,categoryName,name,description:window.SANGUO_COMMAND_DESCRIPTION(id,name,categoryId),status:active.has(id)?"active":"planned",parameters:["actor_id","target_ids","amount","options"]});
  return {schemaVersion:1,categories:Object.entries(groups).map(([id,[name]])=>({id,name})),commands};
})();
