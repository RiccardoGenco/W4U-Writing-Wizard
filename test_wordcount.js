const rawContent = "La porta di casa Rossi si aprì con un tintinnio di eccitazione, mentre i bambini correvano freneticamente avanti e indietro, lanciando sguardi incuriositi verso il trasportino da cui provenivano lievi guaiti. Max, un cucciolo di Labrador dal mantello dorato e dagli occhi vispi, era finalmente arrivato.";
const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF]/g;
const cleanContent = rawContent.replace(emojiRegex, '');
const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;
console.log('Word count:', wordCount);
console.log('Clean content length:', cleanContent.length);
