// js/combatFlavor.js — Bilingual micro-copy pools for every combat / ability interaction
// Uses getLang() from i18n so Hebrew / English switches at runtime.
// ─────────────────────────────────────────────────────────────────────────────

import { getLang } from './i18n.js';

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Per-language pools ────────────────────────────────────────────────────────

const POOLS = {

  en: {
    // ── ATTACK ────────────────────────────────────────────────────────────
    atk_fumble: [
      `{a} stumbles — the weapon nearly slips from their grip.`,
      `Catastrophic fumble! {t} watches {a}'s wild flail with mild concern.`,
      `{a}'s footing gives out at the worst possible moment.`,
      `The fates themselves cringe. {a} hits nothing but air.`,
    ],
    atk_crit: [
      `{a} finds a gap in {t}'s defenses — absolutely devastating!`,
      `Time slows as {a}'s strike connects perfectly. {t} has no answer.`,
      `A wild gleam in {a}'s eye — and {t} never stood a chance.`,
      `{a} shatters {t}'s guard with a blow that echoes across the battlefield.`,
      `The crowd gasps. {a} just hit harder than anyone thought possible.`,
    ],
    atk_hit_melee: [
      `{a}'s blade finds its mark. {t} staggers back.`,
      `A solid hit — {t} barely parried and still took it.`,
      `{a} presses the attack and draws blood from {t}.`,
      `{t} absorbs the blow but it's going to leave a mark.`,
      `Steel meets flesh. {a} scores another clean strike.`,
    ],
    atk_miss_melee: [
      `{a}'s swing goes wide — {t} sidesteps effortlessly.`,
      `{t} deflects {a}'s blow without breaking a sweat.`,
      `An overextended lunge! {a} misses and has to reset.`,
      `{t} reads the attack coming and slips aside.`,
    ],
    atk_hit_ranged: [
      `{a}'s shot cuts through the air and finds {t}!`,
      `Dead-eye — {a} drops the projectile right into {t}.`,
      `The arc is perfect. {t} had no time to react.`,
      `{a} exhales, releases — and {t} takes the hit square.`,
    ],
    atk_miss_ranged: [
      `{a}'s shot cuts the air — {t} ducks just in time.`,
      `The arrow rattles off stone somewhere behind {t}.`,
      `{a} pulls right, the shot sails left.`,
      `{t} sidesteps with a grin. Not even close.`,
    ],
    atk_miss_pointblank: [
      `Too close for comfort — {a}'s shot is thrown off completely.`,
      `Point-blank range works against {a}. The shot goes wide.`,
      `{t} steps inside {a}'s arc, ruining the aim.`,
    ],
    // ── SPELL ─────────────────────────────────────────────────────────────
    spell_crit: [
      `Raw arcane power! {a}'s {sp} tears through {t} at full force!`,
      `A perfect magical strike — {t} caught the full release of {sp}.`,
      `The magic overloads on impact. {t} reels from {a}'s critical {sp}.`,
    ],
    spell_hit: [
      `{a}'s {sp} slams into {t} with arcane precision.`,
      `The spell finds {t} like a homing bolt.`,
      `{t} couldn't dodge {a}'s {sp} — the hit lands clean.`,
      `{sp} detonates against {t}. {a} nods with satisfaction.`,
    ],
    spell_miss: [
      `{a}'s {sp} dissipates just before reaching {t}.`,
      `The spell fizzles — {t} twists clear at the last moment.`,
      `{a}'s magic arcs wide. {t} breathes a sigh of relief.`,
      `The weave slips. {a}'s {sp} finds nothing but empty air.`,
    ],
    spell_save_failed: [
      `{t} takes the full brunt of {a}'s {sp}. No escape.`,
      `The {sp} crashes over {t} before they could react.`,
      `{t} had nowhere to go. {a}'s {sp} hits dead-on.`,
      `A failed save — {t} catches every ounce of {a}'s {sp}.`,
    ],
    spell_save_half: [
      `{t} braces and takes only half the blast from {sp}.`,
      `Quick reflexes spare {t} the worst of {a}'s {sp}.`,
      `{t} rolls clear — still scorched, but alive.`,
      `{a}'s {sp} clips {t} as they dive away.`,
    ],
    spell_utility: [
      `{a} weaves a precise incantation. The effect settles over {t}.`,
      `The air shimmers as {sp} takes hold of {t}.`,
      `{a}'s magic finds {t} unerringly. The {sp} is complete.`,
      `{t} feels the pull of {a}'s {sp} — subtle but undeniable.`,
    ],
    // ── HEAL ──────────────────────────────────────────────────────────────
    heal: [
      `Life flows back into {n}. Back in the fight.`,
      `{n} patches up and steadies their footing.`,
      `A brief respite — {n} is looking better already.`,
      `{n} winces, breathes deep. The color returns to their face.`,
      `The wounds close. {n} rolls their shoulders and grins.`,
    ],
    // ── CLASS ABILITIES ───────────────────────────────────────────────────
    rage: [
      `🔥 Battle-fury courses through {n}'s veins! RAGING! (+2 dmg, adv STR)`,
      `🔥 {n} lets out a primal roar and enters Rage!`,
      `🔥 Something ancient and dangerous awakens in {n}. RAGE!`,
      `🔥 The world narrows. {n} sees only the fight. RAGE!`,
    ],
    endRage: [
      `🔥 The fury drains from {n}'s eyes. Rage ends.`,
      `🔥 {n} steadies their breathing — the Rage has passed.`,
      `🔥 Exhaustion sweeps over {n} as the battle-fury fades.`,
    ],
    secondWind: [
      `💨 {n} catches a second wind — the fight isn't over yet!`,
      `💨 Veteran instincts kick in. {n} steadies and presses forward.`,
      `💨 With grim determination, {n} pushes through the pain.`,
      `💨 Second Wind: {n} draws on reserves nobody knew they had.`,
    ],
    actionSurge: [
      `⚡ A surge of adrenaline — {n} acts again!`,
      `⚡ The crowd gasps as {n} moves with impossible speed.`,
      `⚡ {n} digs deep and finds one more burst of furious action!`,
      `⚡ Action Surge! Nobody blinks — {n} is already moving.`,
    ],
    hide: [
      `🤫 {n} melts into the shadows without a sound.`,
      `🤫 Here one moment, gone the next — {n} has vanished.`,
      `🤫 {n} moves with practiced silence. You don't see them leave.`,
      `🤫 The darkness swallows {n}. Only their enemies will find out where.`,
    ],
    sneakAttack: [
      `🗡️ From the dark, {n} strikes {t} with lethal precision!`,
      `🗡️ {n} exploits the opening — {t} never saw it coming.`,
      `🗡️ Caught off guard, {t} takes the full force of {n}'s sneak attack!`,
      `🗡️ A flash of steel from the shadows — {t} staggers.`,
    ],
    huntersMark: [
      `🎯 {n} locks eyes with {t}. The hunt begins.`,
      `🎯 {t} has become {n}'s marked quarry. Nowhere to run.`,
      `🎯 {n} traces an ancient ranger's mark over {t}. +1d6 on every strike.`,
      `🎯 Hunter's Mark set. {n} will not stop until {t} falls.`,
    ],
    moveHuntersMark: [
      `🎯 {n} shifts their focus — {t} is the new quarry.`,
      `🎯 The mark moves. {t} feels unseen eyes lock onto them.`,
      `🎯 {n} redirects the Hunter's Mark to {t}.`,
    ],
    hex: [
      `🔮 {n} whispers a dark invocation. {t} is hexed.`,
      `🔮 A shadow falls across {t} as {n}'s Hex takes hold. +1d6 necrotic.`,
      `🔮 {t} feels something cold settle over them — {n}'s Hex.`,
      `🔮 The patron's mark is set. {t} walks a cursed road now.`,
    ],
    moveHex: [
      `🔮 {n} lifts the Hex from the fallen and sets it on {t}.`,
      `🔮 The curse moves — {t} is now {n}'s hexed target.`,
      `🔮 {n} redirects the patron's curse to {t}.`,
    ],
    divineSmite: [
      `✨ Holy radiance erupts as {n}'s weapon strikes {t}!`,
      `✨ {n} channels divine power through their blade — radiant justice!`,
      `✨ The gods themselves guide {n}'s smiting blow against {t}!`,
      `✨ Light blazes from {n}'s weapon as Divine Smite obliterates {t}'s defense!`,
    ],
    divineSmiteUndead: [
      `✨ Sacred flame scorches {t} — undead abominations burn twice as bright!`,
      `✨ {n}'s smite detonates against the unholy form of {t}. DOUBLE damage!`,
      `✨ Holy wrath, amplified. {n} tears through {t}'s undead essence!`,
    ],
    wildShape: [
      `🐾 In a blur of shifting flesh, {n} becomes a {x}!`,
      `🐾 {n}'s form ripples — fur and fang take over. A {x} stands in their place!`,
      `🐾 Wild Shape: {n} embraces the primal form of the {x}!`,
      `🐾 The transformation is instant. Where {n} stood, a {x} now prowls.`,
    ],
    endWildShape: [
      `🐾 {n} releases the beast's form, returning to themselves.`,
      `🐾 The wild shape dissolves — {n} stands tall once more.`,
      `🐾 With a shudder, the animal form fades. {n} is back.`,
    ],
    summonAnimal: [
      `🐺 {n} calls upon nature's bond — a {x} answers.`,
      `🐺 From the wilds, {n} summons a faithful {x} companion!`,
      `🐺 A {x} emerges from the undergrowth, answering {n}'s call.`,
    ],
    turnUndeadFailed: [
      `✝️ {n}'s holy symbol blazes — {t} recoils in holy terror!`,
      `✝️ Sacred light floods the area. {t} cannot withstand {n}'s divine power!`,
      `✝️ Turn Undead: the creature {t} is repelled by {n}'s faith!`,
    ],
    turnUndeadResisted: [
      `✝️ {t} resists {n}'s turning — dark power holds firm.`,
      `✝️ The undead {t} stares down {n}'s holy symbol. It holds.`,
      `✝️ {n}'s turning attempt fails — {t} seems fortified against divinity.`,
    ],
    bardicInspiration: [
      `🎵 {n} plays a stirring chord — {t} feels ready to face anything!`,
      `🎵 A few bars from {n} and {t}'s confidence surges. (+1d6 next attack)`,
      `🎵 "{t}, you've got this!" {n}'s inspiration rings clear across the field.`,
      `🎵 {n}'s music cuts through the chaos. {t} stands a little taller.`,
    ],
    flurryOfBlows: [
      `🥋 {n}'s fists are a blur — {t} can't track the strikes!`,
      `🥋 Two strikes faster than thought: {n} unleashes a Flurry on {t}!`,
      `🥋 {n} burns a ki point and becomes a storm of fists against {t}.`,
      `🥋 Flurry of Blows — {t} barely processes one hit before the second lands.`,
    ],
    longRest: [
      `🌙 {n} sleeps soundly and wakes fully restored.`,
      `🌙 After a good night's rest, {n} is ready for whatever comes next.`,
      `🌙 The party makes camp. {n} wakes refreshed, renewed, and dangerous.`,
      `🌙 Long Rest complete — {n} rises like nothing happened.`,
    ],
    spellLearned: [
      `📖 {n} traces the arcane patterns and masters {x}.`,
      `📖 Hours of study pay off — {n} adds {x} to their repertoire.`,
      `📖 {n} commits the incantation to memory. {x} is now in their arsenal.`,
      `📖 The words flow naturally now. {n} has learned {x}.`,
    ],
  },

  he: {
    // ── ATTACK ────────────────────────────────────────────────────────────
    atk_fumble: [
      `{a} מועד — הנשק כמעט נשמט מידיהם.`,
      `מחדל קטסטרופלי! {t} מביט ב{a} בדאגה קלה.`,
      `{a} מאבד יציבות ברגע הגרוע מכל.`,
      `גם הגורל מרים גבה. {a} מפספס לחלוטין.`,
    ],
    atk_crit: [
      `{a} מוצא פרצה בהגנת {t} — מחץ ממש!`,
      `הזמן מואט כשמכת {a} מתחברת בשלמות. ל{t} אין תשובה.`,
      `ברק בעיני {a} — ו{t} לא עמד בכך אפילו לרגע.`,
      `{a} מנפץ את הגנת {t} במהלומה שמהדהדת על שדה הקרב.`,
      `הקהל נאנח. {a} הכה חזק יותר ממה שמישהו דמיין.`,
    ],
    atk_hit_melee: [
      `להב {a} מוצא את מטרתו. {t} נסוג לאחור.`,
      `מכה סולידית — {t} בקושי הגן ועדיין ספג.`,
      `{a} ממשיך בהתקפה ומוציא דם מ{t}.`,
      `{t} בולע את המהלומה אבל היא תשאיר סימן.`,
      `פלדה פוגשת בשר. {a} שוב מכה בדיוק.`,
    ],
    atk_miss_melee: [
      `תנועת {a} עוברת לידו — {t} מתחמק בנינוחות.`,
      `{t} מסיט את מהלומת {a} מבלי להתאמץ.`,
      `התנפלות מוגזמת! {a} מפספס וצריך לאפס מצב.`,
      `{t} קורא את ההתקפה מראש ומחליק הצידה.`,
    ],
    atk_hit_ranged: [
      `החץ של {a} חוצה את האוויר וניצב ב{t}!`,
      `עין חדה — {a} שולח את הקליע ישירות ל{t}.`,
      `הקשת מושלמת. ל{t} לא היה זמן להגיב.`,
      `{a} נושם, משחרר — ו{t} סופג את הפגיעה ישירות.`,
    ],
    atk_miss_ranged: [
      `הירייה של {a} חוצה את האוויר — {t} כורע בזמן.`,
      `החץ מתנגש בסלע מאחורי {t}.`,
      `{a} מושך ימינה, הירייה עפה שמאלה.`,
      `{t} מתחמק בחיוך. בכלל לא קרוב.`,
    ],
    atk_miss_pointblank: [
      `קרוב מדי — הירייה של {a} הולכת לאיבוד.`,
      `מרחק נקודה סופגת עובד נגד {a}. פספוס.`,
      `{t} נכנס לטווח {a} ומבלבל את הכוונה.`,
    ],
    // ── SPELL ─────────────────────────────────────────────────────────────
    spell_crit: [
      `כוח ארקני גולמי! {sp} של {a} קורע דרך {t} בעוצמה מלאה!`,
      `מכה קסומה מושלמת — {t} קיבל את מלוא {sp}.`,
      `הקסם עולה על גדותיו בפגיעה. {t} מתפנה מ{sp} הקריטי של {a}.`,
    ],
    spell_hit: [
      `{sp} של {a} מוחץ את {t} בדיוק ארקני.`,
      `הלחש מוצא את {t} כמו חץ מונחה.`,
      `{t} לא הצליח להתחמק מ{sp} של {a} — הפגיעה נקייה.`,
      `{sp} מתפוצץ על {t}. {a} מהנהן בשביעות רצון.`,
    ],
    spell_miss: [
      `{sp} של {a} מתפוגג רגע לפני ש{t} נפגע.`,
      `הלחש מתכבה — {t} מסתובב מחוץ לטווח ברגע האחרון.`,
      `הקסם של {a} עוקף. {t} נושם לרווחה.`,
      `הרקמה הארקנית מחליקה. {sp} של {a} מוצא רק אוויר.`,
    ],
    spell_save_failed: [
      `{t} סופג את מלוא {sp} של {a}. אין מנוס.`,
      `{sp} מתנפל על {t} לפני שהם הספיקו להגיב.`,
      `ל{t} לא היה לאן לברוח. {sp} של {a} פוגע ישירות.`,
      `הצלה כושלת — {t} סופג כל אונקייה מ{sp} של {a}.`,
    ],
    spell_save_half: [
      `{t} מתכונן ולוקח רק חצי מ{sp}.`,
      `רפלקסים מהירים חוסכים מ{t} את הגרוע ב{sp} של {a}.`,
      `{t} מתגלגל מחוץ לטווח — עדיין שרוף, אך חי.`,
      `{sp} של {a} מגרד את {t} בעת שהם צוללים.`,
    ],
    spell_utility: [
      `{a} שוזר לחישה מדויקת. ההשפעה מתיישבת על {t}.`,
      `האוויר רוטט כש{sp} תופס אחיזה ב{t}.`,
      `קסם {a} מוצא את {t} ללא תחליף. {sp} הושלם.`,
      `{t} מרגיש את משיכת {sp} של {a} — עדין אך בלתי ניתן להכחשה.`,
    ],
    // ── HEAL ──────────────────────────────────────────────────────────────
    heal: [
      `חיים זורמים בחזרה ל{n}. חזרה לקרב.`,
      `{n} מתאחה ומייצב את עמדתם.`,
      `הפוגה קצרה — {n} כבר נראה טוב יותר.`,
      `{n} עוצם עיניים ונושם. הצבע חוזר לפניהם.`,
      `הפצעים נסגרים. {n} מגלגל את כתפיהם ומחייך.`,
    ],
    // ── CLASS ABILITIES ───────────────────────────────────────────────────
    rage: [
      `🔥 זעם קרב גואה בעורקי {n}! טירוף! (+2 נזק, יתרון STR)`,
      `🔥 {n} פולט שאגה פרימורדיאלית ונכנס לטירוף!`,
      `🔥 משהו עתיק ומסוכן מתעורר ב{n}. RAGE!`,
      `🔥 העולם מצטמצם. {n} רואה רק את הקרב. RAGE!`,
    ],
    endRage: [
      `🔥 הזעם מתנקז מעיני {n}. הטירוף מסתיים.`,
      `🔥 {n} מסדיר את נשימתם — הטירוף עבר.`,
      `🔥 עייפות שוטפת את {n} כשהשגעון הקרבי דועך.`,
    ],
    secondWind: [
      `💨 {n} תופס נשימה שנייה — הקרב עדיין לא נגמר!`,
      `💨 יצרנות וטרן מתעוררת. {n} מתייצב וממשיך קדימה.`,
      `💨 בנחישות עיקשת, {n} דוחף דרך הכאב.`,
      `💨 Second Wind: {n} שואב ממאגרים שאיש לא ידע שקיימים.`,
    ],
    actionSurge: [
      `⚡ גל אדרנלין — {n} פועל שוב!`,
      `⚡ הקהל נאנח כש{n} נע במהירות בלתי אפשרית.`,
      `⚡ {n} מתאמץ ומוצא עוד פרץ אחד של פעולה עזה!`,
      `⚡ Action Surge! איש לא מצמיץ — {n} כבר נע.`,
    ],
    hide: [
      `🤫 {n} נמס לתוך הצללים ללא קול.`,
      `🤫 פה רגע, נעלם הבא — {n} התאדה.`,
      `🤫 {n} נע בשתיקה מיומנת. לא רואים אותם יוצאים.`,
      `🤫 החשיכה בולעת את {n}. רק האויבים יגלו לאן.`,
    ],
    sneakAttack: [
      `🗡️ מהחשיכה, {n} תוקף את {t} בדיוק קטלני!`,
      `🗡️ {n} מנצל את הפתח — {t} לא ראה את זה בא.`,
      `🗡️ לכוד לא-מוכן, {t} סופג את מלוא כוח הפגיעה הסמויה של {n}!`,
      `🗡️ ניצוץ פלדה מהצללים — {t} מתפנה.`,
    ],
    huntersMark: [
      `🎯 {n} נועץ מבט ב{t}. הציד מתחיל.`,
      `🎯 {t} הפך לצייד של {n}. אין לאן לברוח.`,
      `🎯 {n} חורת סימן ריינג'ר עתיק על {t}. +1d6 בכל מכה.`,
      `🎯 סמן הציד הוגדר. {n} לא ייעצר עד ש{t} ייפול.`,
    ],
    moveHuntersMark: [
      `🎯 {n} מעביר מיקוד — {t} הוא הצייד החדש.`,
      `🎯 הסמן זז. {t} מרגיש עיניים בלתי נראות נועצות בהם.`,
      `🎯 {n} מעביר את סמן הציד ל{t}.`,
    ],
    hex: [
      `🔮 {n} לוחש לחישה חשוכה. {t} מקולל.`,
      `🔮 צל נופל על {t} כשהקסם של {n} תופס. +1d6 נקרוטי.`,
      `🔮 {t} מרגיש משהו קר מתיישב עליהם — קסם {n}.`,
      `🔮 סימן האדון נקבע. {t} הולך כעת בדרך ארורה.`,
    ],
    moveHex: [
      `🔮 {n} מרים את הקללה מהנפול ומניח אותה על {t}.`,
      `🔮 הקללה עוברת — {t} הוא יעד הקסם החדש של {n}.`,
      `🔮 {n} מפנה את קללת האדון ל{t}.`,
    ],
    divineSmite: [
      `✨ קרינה קדושה פורצת כשנשק {n} פוגע ב{t}!`,
      `✨ {n} מעביר כוח אלוהי דרך להבם — צדק ורדרד!`,
      `✨ האלים עצמם מנחים את מכת השמיטה של {n} נגד {t}!`,
      `✨ אור בוהק מנשק {n} כשDivine Smite מנפץ את הגנת {t}!`,
    ],
    divineSmiteUndead: [
      `✨ להבה קדושה שורפת את {t} — ישויות בלתי-חיות נשרפות כפליים!`,
      `✨ מכת השמיטה של {n} מתפוצצת על צורת ה{t} הבלתי-חיה. נזק כפול!`,
      `✨ זעם קדוש, מוגבר. {n} קורע דרך מהות ה{t} הבלתי-חיה!`,
    ],
    wildShape: [
      `🐾 בטשטוש בשר משתנה, {n} הופך ל{x}!`,
      `🐾 צורת {n} מתרסקת — פרווה וניבים משתלטים. {x} עומד במקומם!`,
      `🐾 Wild Shape: {n} מאמץ את הצורה הפרימורדיאלית של {x}!`,
      `🐾 השינוי מיידי. איפה {n} עמד, {x} מסייר כעת.`,
    ],
    endWildShape: [
      `🐾 {n} משחרר את צורת החיה, חוזר לעצמם.`,
      `🐾 הצורה הפראית מתמוססת — {n} עומד זקוף שוב.`,
      `🐾 עם רעד, צורת החיה דועכת. {n} חזר.`,
    ],
    summonAnimal: [
      `🐺 {n} קורא לקשר הטבע — {x} עונה לקריאה.`,
      `🐺 מהפרא, {n} מזמן חבר {x} נאמן!`,
      `🐺 {x} יוצא מהצמחייה, עונה לקריאת {n}.`,
    ],
    turnUndeadFailed: [
      `✝️ סמל הקדוש של {n} בוהק — {t} נסוג בפחד קדוש!`,
      `✝️ אור קדוש מציף את האזור. {t} אינו יכול לעמוד בכוח {n} האלוהי!`,
      `✝️ Turn Undead: הברייה {t} נדחית על ידי אמונת {n}!`,
    ],
    turnUndeadResisted: [
      `✝️ {t} עומד בפני פנייתו של {n} — כוח האופל מחזיק חזק.`,
      `✝️ ה{t} הבלתי-חי מתעמת עם הסמל הקדוש של {n}. זה מחזיק.`,
      `✝️ ניסיון ה{n} לגרש נכשל — {t} נראה מחוזק כנגד האלוהות.`,
    ],
    bardicInspiration: [
      `🎵 {n} מנגן אקורד מרגש — {t} מרגיש מוכן להתמודד עם הכל!`,
      `🎵 כמה פסוקים מ{n} ובטחון {t} גואה. (+1d6 בהתקפה הבאה)`,
      `🎵 "{t}, תוכל לעשות זאת!" השראת {n} נשמעת ברורה בכל שדה הקרב.`,
      `🎵 מוזיקת {n} חוצה את הכאוס. {t} עומד קצת יותר גבוה.`,
    ],
    flurryOfBlows: [
      `🥋 אגרופי {n} הם טשטוש — {t} לא יכול לעקוב אחרי המכות!`,
      `🥋 שתי מכות מהירות יותר ממחשבה: {n} משחרר Flurry על {t}!`,
      `🥋 {n} שורף נקודת קי והופך לסופת אגרופים נגד {t}.`,
      `🥋 Flurry of Blows — {t} בקושי מעכל מכה אחת לפני שהשנייה נוחתת.`,
    ],
    longRest: [
      `🌙 {n} ישן בשלווה ומתעורר מחודש לחלוטין.`,
      `🌙 אחרי לילה שינה טוב, {n} מוכן לכל מה שיבוא.`,
      `🌙 החבורה חונה. {n} מתעורר רענן, מחודש ומסוכן.`,
      `🌙 Long Rest הושלם — {n} קם כאילו כלום לא קרה.`,
    ],
    spellLearned: [
      `📖 {n} עוקב אחרי תבניות הארקן ושולט ב{x}.`,
      `📖 שעות של לימוד משתלמות — {n} מוסיף את {x} לאוסף שלהם.`,
      `📖 {n} מקבע את הלחישה בזיכרון. {x} עכשיו בארסנל שלהם.`,
      `📖 המילים זורמות טבעית עכשיו. {n} למד את {x}.`,
    ],
  },
};

// ── Template interpolation ────────────────────────────────────────────────────
function _fmt(tpl, vars) {
  return tpl
    .replace(/\{a\}/g, vars.a || '')
    .replace(/\{t\}/g, vars.t || '')
    .replace(/\{n\}/g, vars.n || '')
    .replace(/\{sp\}/g, vars.sp || '')
    .replace(/\{x\}/g, vars.x || '');
}

function _get(key, vars) {
  const lang = getLang();
  const pool = (POOLS[lang] || POOLS.en)[key] || POOLS.en[key] || [];
  if (!pool.length) return '';
  return _fmt(_pick(pool), vars);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function attackFlavor(data) {
  const a = data.cName  || '';
  const t = data.target || '';
  if (data.miss && data.rawRoll === 1)            return _get('atk_fumble',        { a, t });
  if (data.crit)                                  return _get('atk_crit',          { a, t });
  if (data.attackType === 'ranged') {
    if (!data.hit) {
      return data.disadvantage
        ? _get('atk_miss_pointblank', { a, t })
        : _get('atk_miss_ranged',     { a, t });
    }
    return _get('atk_hit_ranged', { a, t });
  }
  return data.hit ? _get('atk_hit_melee', { a, t }) : _get('atk_miss_melee', { a, t });
}

export function spellFlavor(data) {
  const a  = data.cName     || '';
  const t  = data.target    || '';
  const sp = data.spellName || '';
  if (data.savingThrow)  return data.savedHalf ? _get('spell_save_half',   { a, t, sp }) : _get('spell_save_failed', { a, t, sp });
  if (!data.dmgDice)     return _get('spell_utility', { a, t, sp });
  if (data.crit)         return _get('spell_crit',    { a, t, sp });
  return data.hit        ? _get('spell_hit',  { a, t, sp }) : _get('spell_miss', { a, t, sp });
}

export function healFlavor(cName) {
  return _get('heal', { n: cName || '' });
}

export function statusFlavor(slug, cName, targetName, extra) {
  return _get(slug, { n: cName || '', t: targetName || '', a: cName || '', x: extra || '' });
}
