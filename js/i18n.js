// i18n.js - Translation Engine

export const translations = {
    he: {
        // Auth Screen
        "app_title": "ברוכים הבאים ל-CritRoll 2.0",
        "app_desc": "התחבר כדי לגשת לכספת הדמויות והחדרים שלך.",
        "login_google": "התחבר באמצעות Google",
        
        // Lobby Screen
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
        
        // Character Builder
        "cb_title": "יצירת דמות חדשה",
        "cb_portrait": "בחר דיוקן מהמאגר:",
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
        "cb_ac": "AC",
        "cb_speed": "מהירות",
        "cb_pp": "PP",
        "cb_init": "יוזמה+",
        "cb_hp": "חיים (HP)",
        "cb_melee": "קפא״פ+",
        "cb_ranged": "מרחוק+",
        "cb_dmg": "נזק",
        "cb_save_btn": "שמור לכספת",
        "cb_saving": "שומר...",
        
        // Alerts
        "alert_login_fail": "ההתחברות נכשלה!",
        "alert_missing": "חסרים פרטים!",
        "alert_save_err": "שגיאה בשמירת הדמות.",
        "alert_room_created": "החדר שלך נוצר בהצלחה! 👑\nקוד החדר להזמנת שחקנים הוא:"
    },
    en: {
        // Auth Screen
        "app_title": "Welcome to CritRoll 2.0",
        "app_desc": "Log in to access your character vault and rooms.",
        "login_google": "Log in with Google",
        
        // Lobby Screen
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
        
        // Character Builder
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
        "cb_pp": "Passive Perc.",
        "cb_init": "Init+",
        "cb_hp": "Max HP",
        "cb_melee": "Melee+",
        "cb_ranged": "Ranged+",
        "cb_dmg": "Dmg",
        "cb_save_btn": "Save to Vault",
        "cb_saving": "Saving...",
        
        // Alerts
        "alert_login_fail": "Login failed!",
        "alert_missing": "Missing details!",
        "alert_save_err": "Error saving character.",
        "alert_room_created": "Room created successfully! 👑\nRoom code for your players is:"
    }
};

let currentLang = localStorage.getItem('critroll_lang') || 'he';

export function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('critroll_lang', lang);
    
    // Automatically swap the entire site from right-to-left to left-to-right!
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    
    updateDOM();
}

export function getLang() {
    return currentLang;
}

// Translate a specific string (Used in JS files)
export function t(key) {
    return translations[currentLang][key] || key;
}

// Automatically translate all HTML elements with the data-i18n attribute
export function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                el.placeholder = translations[currentLang][key];
            } else {
                el.innerHTML = translations[currentLang][key];
            }
        }
    });

    // Update dynamically generated select options safely
    document.querySelectorAll('option[data-i18n]').forEach(opt => {
        const key = opt.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            opt.innerText = translations[currentLang][key];
        }
    });
}
