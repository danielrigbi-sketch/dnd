// diceEngine.js - מנוע הקוביות התלת-ממדיות

// ייבוא הספרייה (הועבר מ-app.js)
import DiceBox from "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js";

let diceBox;

// פונקציית האתחול - נקרא לה פעם אחת כשהאפליקציה עולה
export async function initDiceEngine() {
    diceBox = new DiceBox({
        container: "#dice-box-canvas", // מצביע לקונטיינר שיהיה בתוך הזירה
        origin: "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/",
        assetPath: "assets/",
        theme: "default",
        scale: 35, // שומרים על ההגדלה המשמעותית שהגדרת
        gravity: 4
        // הערה: אם היו לך הגדרות נוספות ב-app.js מתחת ל-gravity שלא הופיעו בקטע הקוד ששלחת, הוסף אותן כאן
    });

    await diceBox.init();
    return diceBox;
}

// פונקציית ההטלה - מקבלת מחרוזת (כמו '1d20') ומחזירה את התוצאה
export async function roll3DDice(notation) {
    if (!diceBox) {
        console.error("Dice engine is not initialized!");
        return null;
    }
    
    // אופציונלי: מנקה את הזירה מקוביות קודמות לפני הטלה חדשה
    diceBox.clear(); 
    
    return await diceBox.roll(notation);
}

// פונקציית עזר לניקוי הקוביות מהמסך (אם נצטרך)
export function clearDice() {
    if (diceBox) {
        diceBox.clear();
    }
}
