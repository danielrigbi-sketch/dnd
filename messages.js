const getRandomMsg = (msgs) => msgs[Math.floor(Math.random() * msgs.length)];

export function getFlavorText(type, res, total, maxVal) {
    if (type === 'd20') {
        if (res === 20) return getRandomMsg(["האלים מריעים לך! 🌟", "פגיעה קטלנית!", "אגדה נולדה!", "היסטוריה נכתבת ב-20 טבעי!"]);
        if (res === 1) return getRandomMsg(["זה הולך לכאוב... 💀", "יום רע להיות הרפתקן.", "החרב החליקה?", "הכישלון הזה ייזכר לדורות..."]);
        if (total >= 25) return getRandomMsg(["מעשה גבורה שייכתב בדברי הימים!", "עוצמה שלא מהעולם הזה!", "האויב נראה המום מהפגיעה!"]);
        if (total >= 18) return getRandomMsg(["מכה מרשימה ביותר!", "ביצוע של מקצוען אמיתי.", "האימונים השתלמו ברגע האמת."]);
        if (total >= 12) return getRandomMsg(["תוצאה סולידית, לא רע.", "זה יעשה את העבודה.", "פגיעה נקייה, העסק מתקדם."]);
        return getRandomMsg(["אולי כדאי לנסות שוב...", "כמעט פגעת בציפור שעברה שם.", "נשימה עמוקה ובפעם הבאה לכוון."]);
    } 

    if (total >= maxVal + 5) return "מעבר לכל הציפיות! כוח מתפרץ! 🔥";
    if (res === maxVal) return "מקסימום עוצמה! מכה מדויקת.";
    if (total > maxVal / 2) return "נחמד, זה בטח יזיז משהו.";
    return "זה בקושי שריטה... אולי בפעם הבאה.";
}
