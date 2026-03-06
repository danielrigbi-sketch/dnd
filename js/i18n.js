// i18n.js - Translation Engine

export const translations = {
    he: {
        "app_title": "ברוכים הבאים ל-CritRoll 2.0",
        "app_desc": "התחבר כדי לגשת לכספת הדמויות והחדרים שלך.",
        "login_google": "התחבר באמצעות Google",
        "hello": "שלום",
        "logout": "התנתק",
        "game_room_title": "🎲 חדר משחק",
        "player_join_title": "שחקן: כניסה לחדר קיים",
        "room_code_ph": "קוד חדר",
        "join_btn": "היכנס",
        "vault_hint": "* בחר דמות מהכספת שלך כדי להיכנס.",
        "dm_create_title": "שליט מבוך: פתיחת חדר חדש",
        "create_room_btn": "👑 פתח חדר כ-DM",
        "vault_title": "🛡️ הכספת שלי",
        "new_char_btn": "+ דמות חדשה",
        "empty_vault": "עדיין אין לך דמויות בכספת.<br>צור את הדמות הראשונה שלך!",
        "select_btn": "בחר",
        "cb_title": "יצירת דמות חדשה",
        "cb_portrait": "בחר דיוקן:",
        "cb_name_ph": "שם הדמות",
        "cb_race": "גזע",
        "race_human": "אדם",
        "race_elf": "אלף",
        "race_dwarf": "גמד",
        "cb_class": "מקצוע",
        "class_fighter": "לוחם",
        "class_wizard": "קוסם",
        "class_rogue": "נוכל",
        "class_cleric": "כוהן",
        "cb_ac": "AC (שריון)",
        "cb_speed": "מהירות",
        "cb_pp": "הבחנה",
        "cb_init": "יוזמה+",
        "cb_hp": "חיים (HP)",
        "cb_melee": "קפא״פ+",
        "cb_ranged": "מרחוק+",
        "cb_dmg": "נזק",
        
        // Vault 2.0 Additions
        "alert_no_room_code": "אנא הזן קוד חדר כדי להיכנס למשחק.",
        "delete_confirm": "האם אתה בטוח שברצונך למחוק את הדמות לצמיתות?",
        "btn_update_char": "עדכן דמות",
        "title_edit_char": "עריכת דמות",
        "port_tab_preset": "מאגר",
        "port_tab_url": "לינק",
        "port_tab_file": "קובץ",
        "port_url_ph": "הדבק לינק לתמונה (URL)",
        "color_picker_label": "צבע הקוביות:",
        
        "cb_attacks_title": "נשקים ולחשים מיוחדים:",
        "cb_add_attack": "➕ הוסף התקפה/לחש",
        "ph_atk_name": "שם (למשל: חרב)",
        "ph_atk_bonus": "תוסף+",
        "ph_atk_dmg": "נזק (1d8)",
        "cb_save_btn": "שמור לכספת",
        "cb_saving": "שומר...",
        "alert_login_fail": "ההתחברות נכשלה!",
        "alert_save_err": "שגיאה בשמירת הדמות.",
        "alert_room_created": "החדר שלך נוצר! 👑 קוד החדר:",
        "alert_room_created_title": "החדר שלך מוכן! 👑",
        "alert_room_copy": "📋 העתק קוד",
        "alert_room_copied": "✅ הועתק!",
        "alert_room_enter": "🚪 כנס לחדר",
        
        // Form validation
        "field_required": "שדה חובה",
        "alert_missing_fields": "נא למלא את כל השדות המסומנים באדום",
        
        // Game Room
        "party_title": "חבורת ההרפתקנים",
        "rolling_as": "🎭 מגלגל כעת בתור:",
        "back_btn": "(חזור)",
        "dm_panel_title": "מאגר מפלצות ודמויות (DM)",
        "custom_npc": "-- דמות מותאמת אישית --",
        "ph_specific_name": "שם ספציפי",
        "ph_class_opt": "מקצוע (אופציונלי)",
        "ph_hp": "חיים",
        "ph_init": "יוזמה+",
        "ph_count": "כמות",
        "ph_melee": "קפא״פ+",
        "ph_melee_dmg": "קוביית נזק",
        "ph_ranged": "מרחוק+",
        "ph_ranged_dmg": "קוביית נזק",
        "hide_from_players": "הסתר מהשחקנים",
        "add_npc_roll": "➕ הוסף וגלגל יוזמה",
        "open_combat": "⚔️ פתח יוזמה",
        "end_combat": "🛑 סיים קרב ואיפוס",
        "mute_sound": "🔇 השתק סאונד",
        "unmute_sound": "🔊",
        "event_log": "לוג אירועים:",
        "waiting_roll": "ממתין להטלה...",
        "mod_label": "תוסף:",
        "waiting_combat": "⌛ ממתין לקרב",
        "roll_init_btn": "⚡ גלגל יוזמה!",
        "registered": "✅ רשום",
        "dice_menu": "🎲 קוביות",
        "adv": "יתרון",
        "dis": "חיסרון",
        
        // Alerts & Logs
        "alert_not_started": "השה\"מ טרם פתח את הקרב!",
        "alert_end_combat": "האם אתה בטוח שברצונך לסיים את הקרב ולאפס את היוזמה?",
        "alert_delete_npc_1": "האם אתה בטוח שברצונך למחוק את ",
        "alert_delete_npc_2": " מהלוח?",
        "alert_no_dmg": "אין נזק מוגדר להתקפה זו.",
        "default_monster": "מפלצת",
        "card_defense": "הגנה",
        "card_speed": "מהירות",
        "card_perc": "הבחנה",
        "card_init": "יוזמה",
        "card_melee": "קפא״פ",
        "card_ranged": "מרחוק",
        "card_macros_title": "התקפות ונזק (מאקרו):",
        "macro_attack": "התקפה",
        "macro_dmg": "נזק",
        "hidden_data": "הנתונים מוסתרים.",
        "log_heals": "זוכה לריפוי!",
        "log_takes_dmg": "סופג פגיעה!",
        "log_points": "נק'",
        "log_revealed": "חשף מהצללים את 👁️",
        "log_added": "הוסיף את ⚔️",
        "log_hidden_tag": " (מוסתרת)",
        "log_init": "יוזמה:",
        "log_attack": "מבצע התקפת",
        "log_roll_dmg": "גלגל נזק",
        "log_rolled": "הטיל",
        "log_and_got": "וקיבל",
        
        // Monsters
        "mon_goblin": "גובלין",
        "mon_skeleton": "שלד",
        "mon_zombie": "זומבי",
        "mon_bandit": "שודד",
        "mon_orc": "אורק",
        "mon_wolf": "זאב נורא",
        "mon_spider": "עכביש ענק",
        "mon_owlbear": "דוב-ינשוף",
        "mon_troll": "טרול",
        "mon_mindflayer": "מצליף מוח",
        "mon_vampire": "ערפד",
        "mon_dragon": "דרקון צעיר",
        "mon_beholder": "ביהולדר",
        "mon_lich": "ליץ'",

        // =====================
        // Flavor Text (d20)
        // =====================
        "flavor_d20_crit1": "האלים מריעים לך! 🌟",
        "flavor_d20_crit2": "פגיעה קטלנית!",
        "flavor_d20_crit3": "אגדה נולדת!",
        "flavor_d20_crit4": "היסטוריה נכתבת ב-20 טבעי!",
        "flavor_d20_fail1": "זה הולך לכאוב... 💀",
        "flavor_d20_fail2": "יום רע להיות הרפתקן.",
        "flavor_d20_fail3": "החרב החליקה?",
        "flavor_d20_fail4": "הכישלון הזה ייזכר לדורות...",
        "flavor_d20_high1": "מעשה גבורה שייכתב בדברי הימים!",
        "flavor_d20_high2": "עוצמה שלא מהעולם הזה!",
        "flavor_d20_high3": "האויב נראה המום מהפגיעה!",
        "flavor_d20_good1": "מכה מרשימה ביותר!",
        "flavor_d20_good2": "ביצוע של מקצוען אמיתי.",
        "flavor_d20_good3": "האימונים השתלמו ברגע האמת.",
        "flavor_d20_mid1": "תוצאה סולידית, לא רע.",
        "flavor_d20_mid2": "זה יעשה את העבודה.",
        "flavor_d20_mid3": "פגיעה נקייה, העסק מתקדם.",
        "flavor_d20_low1": "אולי כדאי לנסות שוב...",
        "flavor_d20_low2": "כמעט פגעת בציפור שעברה שם.",
        "flavor_d20_low3": "נשימה עמוקה ובפעם הבאה לכוון.",

        // Flavor Text (generic dice)
        "flavor_gen_max_plus": "מעבר לכל הציפיות! כוח מתפרץ! 🔥",
        "flavor_gen_max": "מקסימום עוצמה! מכה מדויקת.",
        "flavor_gen_mid": "נחמד, זה בטח יזיז משהו.",
        "flavor_gen_low": "זה בקושי שריטה... אולי בפעם הבאה."
    },
    en: {
        "app_title": "Welcome to CritRoll 2.0",
        "app_desc": "Log in to access your character vault and rooms.",
        "login_google": "Log in with Google",
        "hello": "Hello",
        "logout": "Logout",
        "game_room_title": "🎲 Game Room",
        "player_join_title": "Player: Join Existing Room",
        "room_code_ph": "Room Code",
        "join_btn": "Join",
        "vault_hint": "* Select a character from your vault to enter.",
        "dm_create_title": "Dungeon Master: Create New Room",
        "create_room_btn": "👑 Create DM Room",
        "vault_title": "🛡️ My Vault",
        "new_char_btn": "+ New Character",
        "empty_vault": "Your vault is empty.<br>Create your first character!",
        "select_btn": "Select",
        "cb_title": "Create New Character",
        "cb_portrait": "Choose a portrait:",
        "cb_name_ph": "Character Name",
        "cb_race": "Race",
        "race_human": "Human",
        "race_elf": "Elf",
        "race_dwarf": "Dwarf",
        "cb_class": "Class",
        "class_fighter": "Fighter",
        "class_wizard": "Wizard",
        "class_rogue": "Rogue",
        "class_cleric": "Cleric",
        "cb_ac": "AC",
        "cb_speed": "Speed",
        "cb_pp": "Pass. Perc",
        "cb_init": "Init+",
        "cb_hp": "Max HP",
        "cb_melee": "Melee+",
        "cb_ranged": "Ranged+",
        "cb_dmg": "Dmg",
        
        // Vault 2.0 Additions
        "alert_no_room_code": "Please enter a valid room code to join.",
        "delete_confirm": "Are you sure you want to permanently delete this character?",
        "btn_update_char": "Update Character",
        "title_edit_char": "Edit Character",
        "port_tab_preset": "Presets",
        "port_tab_url": "URL",
        "port_tab_file": "File",
        "port_url_ph": "Paste image URL",
        "color_picker_label": "Dice Color:",
        
        "cb_attacks_title": "Custom Attacks & Spells:",
        "cb_add_attack": "➕ Add Attack/Spell",
        "ph_atk_name": "Name (e.g. Sword)",
        "ph_atk_bonus": "Bonus+",
        "ph_atk_dmg": "Dmg (1d8)",
        "cb_save_btn": "Save to Vault",
        "cb_saving": "Saving...",
        "alert_login_fail": "Login failed!",
        "alert_save_err": "Error saving character.",
        "alert_room_created": "Room created! 👑 Room code:",
        "alert_room_created_title": "Your room is ready! 👑",
        "alert_room_copy": "📋 Copy Code",
        "alert_room_copied": "✅ Copied!",
        "alert_room_enter": "🚪 Enter Room",

        // Form validation
        "field_required": "Required",
        "alert_missing_fields": "Please fill in all highlighted fields",
        
        // Game Room
        "party_title": "The Adventuring Party",
        "rolling_as": "🎭 Rolling as:",
        "back_btn": "(Back)",
        "dm_panel_title": "NPC & Monster Database (DM)",
        "custom_npc": "-- Custom NPC --",
        "ph_specific_name": "Specific Name",
        "ph_class_opt": "Class (Optional)",
        "ph_hp": "HP",
        "ph_init": "Init+",
        "ph_count": "Count",
        "ph_melee": "Melee+",
        "ph_melee_dmg": "Damage Die",
        "ph_ranged": "Ranged+",
        "ph_ranged_dmg": "Damage Die",
        "hide_from_players": "Hide from players",
        "add_npc_roll": "➕ Add & Roll Init",
        "open_combat": "⚔️ Start Combat",
        "end_combat": "🛑 End Combat & Reset",
        "mute_sound": "🔇 Mute Sound",
        "unmute_sound": "🔊",
        "event_log": "Event Log:",
        "waiting_roll": "Waiting for roll...",
        "mod_label": "Mod:",
        "waiting_combat": "⌛ Waiting for combat",
        "roll_init_btn": "⚡ Roll Init!",
        "registered": "✅ Registered",
        "dice_menu": "🎲 Dice",
        "adv": "Advantage",
        "dis": "Disadvantage",
        
        // Alerts & Logs
        "alert_not_started": "The DM hasn't started combat yet!",
        "alert_end_combat": "Are you sure you want to end combat and reset initiative?",
        "alert_delete_npc_1": "Are you sure you want to remove ",
        "alert_delete_npc_2": " from the board?",
        "alert_no_dmg": "No damage defined for this attack.",
        "default_monster": "Monster",
        "card_defense": "AC",
        "card_speed": "Speed",
        "card_perc": "Perc",
        "card_init": "Init",
        "card_melee": "Melee",
        "card_ranged": "Ranged",
        "card_macros_title": "Attacks & Damage (Macros):",
        "macro_attack": "Attack",
        "macro_dmg": "Dmg",
        "hidden_data": "Data is hidden.",
        "log_heals": "is healed!",
        "log_takes_dmg": "takes damage!",
        "log_points": "pts",
        "log_revealed": "revealed 👁️",
        "log_added": "added ⚔️",
        "log_hidden_tag": " (Hidden)",
        "log_init": "Init:",
        "log_attack": "attacks with",
        "log_roll_dmg": "rolls damage for",
        "log_rolled": "Rolled",
        "log_and_got": "and got",
        
        // Monsters
        "mon_goblin": "Goblin",
        "mon_skeleton": "Skeleton",
        "mon_zombie": "Zombie",
        "mon_bandit": "Bandit",
        "mon_orc": "Orc",
        "mon_wolf": "Dire Wolf",
        "mon_spider": "Giant Spider",
        "mon_owlbear": "Owlbear",
        "mon_troll": "Troll",
        "mon_mindflayer": "Mind Flayer",
        "mon_vampire": "Vampire",
        "mon_dragon": "Young Dragon",
        "mon_beholder": "Beholder",
        "mon_lich": "Lich",

        // =====================
        // Flavor Text (d20)
        // =====================
        "flavor_d20_crit1": "The gods cheer for you! 🌟",
        "flavor_d20_crit2": "Critical hit!",
        "flavor_d20_crit3": "A legend is born!",
        "flavor_d20_crit4": "History is written on a natural 20!",
        "flavor_d20_fail1": "That's gonna hurt... 💀",
        "flavor_d20_fail2": "A bad day to be an adventurer.",
        "flavor_d20_fail3": "Did the sword slip?",
        "flavor_d20_fail4": "This failure will be remembered for ages...",
        "flavor_d20_high1": "A heroic feat worthy of the chronicles!",
        "flavor_d20_high2": "Power beyond this world!",
        "flavor_d20_high3": "The enemy looks stunned by the strike!",
        "flavor_d20_good1": "A most impressive blow!",
        "flavor_d20_good2": "Executed like a true professional.",
        "flavor_d20_good3": "All that training paid off.",
        "flavor_d20_mid1": "A solid result, not bad.",
        "flavor_d20_mid2": "That'll get the job done.",
        "flavor_d20_mid3": "Clean hit, moving forward.",
        "flavor_d20_low1": "Maybe try again...",
        "flavor_d20_low2": "You almost hit that passing bird.",
        "flavor_d20_low3": "Deep breath, aim better next time.",

        // Flavor Text (generic dice)
        "flavor_gen_max_plus": "Beyond all expectations! Bursting power! 🔥",
        "flavor_gen_max": "Maximum power! Precise strike.",
        "flavor_gen_mid": "Nice, that should move something.",
        "flavor_gen_low": "Barely a scratch... maybe next time."
    }
};

let currentLang = localStorage.getItem('critroll_lang') || 'he';

document.documentElement.lang = currentLang;
document.documentElement.dir = currentLang === 'he' ? 'rtl' : 'ltr';

export function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('critroll_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    updateDOM();
}

export function getLang() {
    return currentLang;
}

export function t(key) {
    return translations[currentLang][key] || translations['he'][key] || key;
}

export function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.innerHTML = translations[currentLang][key];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLang][key]) {
            el.placeholder = translations[currentLang][key];
        }
    });
    document.querySelectorAll('option[data-i18n]').forEach(opt => {
        const key = opt.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            opt.innerText = translations[currentLang][key];
        }
    });
}
