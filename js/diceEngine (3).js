// diceEngine.js - מנוע הקוביות התלת-ממדיות

import DiceBox from "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js";

let diceBox;

// פונקציית האתחול - נקרא לה פעם אחת כשהאפליקציה עולה
export async function initDiceEngine() {
    diceBox = new DiceBox({
        container: "#dice-box-canvas", // מצביע לקונטיינר שיהיה בתוך הזירה
        origin: "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/",
        assetPath: "assets/",
        theme: "default",
        scale: 8, // הגדלה משמעותית כדי שיראו מצוין בנייד ובלפטופ
        gravity: 2, // כוח משיכה חזק יותר לנחיתה יציבה
        friction: 0.5,
        sounds: false,
        settleTimeout: 5000 // זמן המתנה לעצירת הקובייה
    });

    await diceBox.init();
    return diceBox;
}

// פונקציה לעדכון צבע הקוביות לפני ההטלה
export async function updateDiceColor(color) {
    if (diceBox) {
        await diceBox.updateConfig({ themeColor: color });
    }
}

// פונקציית ההטלה - מקבלת מחרוזת והגדרות אופציונליות ומחזירה את התוצאה
export async function roll3DDice(notation, options = {}) {
    if (!diceBox) {
        console.error("Dice engine is not initialized!");
        return null;
    }
    
    return await diceBox.roll(notation, options);
}

// פונקציית עזר לניקוי הקוביות מהמסך
export function clearDice() {
    if (diceBox) {
        diceBox.clear();
    }
}
