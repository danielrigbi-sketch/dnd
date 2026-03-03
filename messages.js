const getRandomMsg = (msgs) => msgs[Math.floor(Math.random() * msgs.length)];

export function getFlavorText(type, res, total, maxVal) {
    if (type === 'd20') {
        if (res === 20) return getRandomMsg(["האלים מריעים לך! 🌟", "פגיעה קטלנית!", "אגדה נולדה!"]);
        if (res === 1) return getRandomMsg(["זה הולך לכאוב... 💀", "יום רע להיות הרפתקן.", "החרב החליקה?"]);
        if (total >= 18) return "מכה מרשימה ביותר!";
        if (total >= 12) return "תוצאה סולידית, לא רע.";
        return "זה יעשה את העבודה.";
    } 
    
    if (total >= maxVal + 5) return "מעבר לכל הציפיות! 🔥";
    if (res === maxVal) return "מקסימום עוצמה!";
    return "הטלה מעניינת...";
}
