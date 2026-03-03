const getRandomMsg = (msgs) => msgs[Math.floor(Math.random() * msgs.length)];

export function getFlavorText(type, res, total, maxVal) {
    if (type === 'd20') {
        if (res === 20) return getRandomMsg(["האלים מריעים לך! 🌟", "פגיעה קטלנית!", "אגדה נולדה!", "היסטוריה נכתבת ב-20 טבעי!"]);
        if (res === 1) return getRandomMsg(["זה הולך לכאוב... 💀", "יום רע להיות הרפתקן.", "החרב החליקה?", "הכישלון הזה ייזכר לדורות..."]);
        if (total >= 25) return getRandomMsg(["מעשה גבורה שייכתב בדברי הימים!", "עוצמה שלא מהעולם הזה!"]);
        if (total >= 18) return getRandomMsg(["מכה מרשימה ביותר!", "ביצוע של מקצוען אמיתי."]);
        if (total >= 12) return getRandomMsg(["תוצאה סולידית, לא רע.", "זה יעשה את העבודה."]);
        return getRandomMsg(["אולי כדאי לנסות שוב... בחיים הבאים.", "כמעט פגעת בציפור שעברה שם."]);
    } 

    // לוגיקה לקוביות נזק/ריפוי
    if (total >= maxVal + 5) return "מעבר לכל הציפיות! 🔥";
    if (res === maxVal) return "מקסימום עוצמה!";
    if (total > maxVal / 2) return "פגיעה סבירה בהחלט.";
    return "זה בקושי שריטה...";
}
