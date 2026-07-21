const dateStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
console.log('dateStr:', dateStr);
const d = new Date(dateStr);
console.log('Parsed:', d);
console.log('getHours:', d.getHours());
console.log('getMinutes:', d.getMinutes());
console.log('getDay:', d.getDay());
