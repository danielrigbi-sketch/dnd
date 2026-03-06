// messages.js - Flavor text engine (bilingual via i18n)
import { t } from "./i18n.js?v=125";

const getRandomMsg = (keys) => {
    const key = keys[Math.floor(Math.random() * keys.length)];
    return t(key);
};

export function getFlavorText(type, res, total, maxVal) {
    if (type === 'd20') {
        if (res === 20) return getRandomMsg(['flavor_d20_crit1','flavor_d20_crit2','flavor_d20_crit3','flavor_d20_crit4']);
        if (res === 1)  return getRandomMsg(['flavor_d20_fail1','flavor_d20_fail2','flavor_d20_fail3','flavor_d20_fail4']);
        if (total >= 25) return getRandomMsg(['flavor_d20_high1','flavor_d20_high2','flavor_d20_high3']);
        if (total >= 18) return getRandomMsg(['flavor_d20_good1','flavor_d20_good2','flavor_d20_good3']);
        if (total >= 12) return getRandomMsg(['flavor_d20_mid1','flavor_d20_mid2','flavor_d20_mid3']);
        return getRandomMsg(['flavor_d20_low1','flavor_d20_low2','flavor_d20_low3']);
    }

    if (total >= maxVal + 5) return t('flavor_gen_max_plus');
    if (res === maxVal)      return t('flavor_gen_max');
    if (total > maxVal / 2)  return t('flavor_gen_mid');
    return t('flavor_gen_low');
}
