const fs = require('fs');
const https = require('https');

const icons = [
    'instagram', 'telegram', 'whatsapp', 'x', 'twitter', 'facebook', 'linkedin', 'youtube',
    'tiktok', 'pinterest', 'snapchat', 'reddit', 'discord', 'twitch', 'github', 'gitlab',
    'medium', 'dribbble', 'behance', 'figma', 'spotify', 'soundcloud', 'applemusic', 'vimeo',
    'skype', 'slack', 'trello', 'notion', 'wordpress', 'blogger', 'aparat'
];

async function fetchIcon(name) {
    return new Promise((resolve, reject) => {
        https.get(`https://cdn.jsdelivr.net/npm/simple-icons@v11.0.0/icons/${name}.svg`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({ name, svg: data });
                } else {
                    resolve({ name, svg: '' });
                }
            });
        }).on('error', err => reject(err));
    });
}

async function main() {
    let svgArray = [];
    for (let icon of icons) {
        try {
            const res = await fetchIcon(icon);
            if (res.svg) {
                // Add some basic styling to make it fit
                let svg = res.svg.replace('<svg ', `<svg style="width: 20px; height: 20px; fill: currentColor;" `);
                svgArray.push({ name: res.name, svg: svg });
            }
        } catch (e) {
            console.error(e);
        }
    }
    fs.writeFileSync('social_icons.json', JSON.stringify(svgArray));
    console.log(`Downloaded ${svgArray.length} icons.`);
}
main();
