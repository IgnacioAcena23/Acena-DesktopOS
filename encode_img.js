const fs = require('fs');
try {
    const data = fs.readFileSync('Gasli ig.jpeg');
    const b64 = 'data:image/jpeg;base64,' + data.toString('base64');
    fs.writeFileSync('b64.txt', b64);
    console.log('Encoded to b64.txt');
} catch (e) {
    console.error(e);
}
