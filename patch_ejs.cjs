const fs = require('fs');
let code = fs.readFileSync('views/leaves.ejs', 'utf8');

const target1 = `        async function loadLeaves() {
            const listEl = document.getElementById('leavesList');
            try {
                const res = await fetch('/api/get_leaves');
                const result = await res.json();
                
                if (result.status === 'success') {
                    renderLeaves(result.data, result.isAdmin);
                } else {
                    listEl.innerHTML = \`<div style="text-align: center; color: var(--error-color); padding: 20px;">\${result.message || 'خطا در دریافت اطلاعات'}</div>\`;
                }
            } catch(e) {
                console.error(e);
                listEl.innerHTML = '<div style="color:red; text-align:center; padding: 20px;">خطا در ارتباط با سرور</div>';
            }
        }`;

const replacement1 = `        let currentType = 'upcoming';
        let currentPage = 1;

        async function loadLeaves(type = 'upcoming', page = 1) {
            currentType = type;
            currentPage = page;
            const listEl = document.getElementById('leavesList');
            const historyBtnContainer = document.getElementById('historyBtnContainer');
            
            if (page === 1) {
                listEl.innerHTML = '<div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px; margin-bottom: 15px;"></div>';
                historyBtnContainer.innerHTML = '';
            } else {
                historyBtnContainer.innerHTML = '<div style="text-align:center;">در حال بارگذاری...</div>';
            }

            try {
                const res = await fetch(\`/api/get_leaves?type=\${type}&page=\${page}&limit=20\`);
                const result = await res.json();
                
                if (result.status === 'success') {
                    renderLeaves(result.data, result.isAdmin, type, page);
                    
                    if (type === 'upcoming') {
                        historyBtnContainer.innerHTML = \`<button class="btn btn-outline" style="width: 100%; margin-top: 15px; border-style: dashed;" onclick="loadLeaves('history', 1)">نمایش تاریخچه مرخصی‌ها</button>\`;
                    } else {
                        const loadedCount = page * result.limit;
                        if (result.total > loadedCount) {
                            historyBtnContainer.innerHTML = \`<button class="btn btn-outline" style="width: 100%; margin-top: 15px; border-style: dashed;" onclick="loadLeaves('history', \${page + 1})">بارگذاری بیشتر (\${result.total - loadedCount} مورد باقی‌مانده)</button>\`;
                        } else {
                            historyBtnContainer.innerHTML = \`<div style="text-align: center; color: var(--text-muted); margin-top: 15px; font-size: 0.9rem;">پایان لیست</div>\`;
                        }
                    }
                } else {
                    listEl.innerHTML = \`<div style="text-align: center; color: var(--error-color); padding: 20px;">\${result.message || 'خطا در دریافت اطلاعات'}</div>\`;
                }
            } catch(e) {
                console.error(e);
                listEl.innerHTML = '<div style="color:red; text-align:center; padding: 20px;">خطا در ارتباط با سرور</div>';
            }
        }`;

const target2 = `        function renderLeaves(leaves, isAdmin) {
            const listEl = document.getElementById('leavesList');
            if (!leaves || leaves.length === 0) {
                listEl.innerHTML = '<div class="searchable-item" style="text-align: center; color: gray; padding: 30px; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border-color);">هیچ درخواستی یافت نشد.</div>';
                return;
            }

            // مرتب‌سازی از جدیدترین
            leaves.sort((a, b) => b.id - a.id);

            let html = '';
            leaves.forEach(l => {`;

const replacement2 = `        function renderLeaves(leaves, isAdmin, type, page) {
            const listEl = document.getElementById('leavesList');
            if (!leaves || leaves.length === 0) {
                if (page === 1) {
                    listEl.innerHTML = '<div class="searchable-item" style="text-align: center; color: gray; padding: 30px; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border-color);">هیچ درخواستی یافت نشد.</div>';
                }
                return;
            }

            let html = '';
            leaves.forEach(l => {`;

const target3 = `            });
            listEl.innerHTML = html;
        }`;

const replacement3 = `            });
            
            if (page === 1) {
                listEl.innerHTML = html;
            } else {
                listEl.insertAdjacentHTML('beforeend', html);
            }
        }`;


const target4 = `<div id="leavesList">
                        <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px; margin-bottom: 15px;"></div>
                        <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px;"></div>
                    </div>`;

const replacement4 = `<div id="leavesList">
                        <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px; margin-bottom: 15px;"></div>
                        <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px;"></div>
                    </div>
                    <div id="historyBtnContainer"></div>`;


if (code.includes(target1) && code.includes(target2) && code.includes(target3) && code.includes(target4)) {
    code = code.replace(target1, replacement1);
    code = code.replace(target2, replacement2);
    code = code.replace(target3, replacement3);
    code = code.replace(target4, replacement4);
    fs.writeFileSync('views/leaves.ejs', code);
    console.log("Success");
} else {
    console.log("Target not found");
    if (!code.includes(target1)) console.log("Target1 not found");
    if (!code.includes(target2)) console.log("Target2 not found");
    if (!code.includes(target3)) console.log("Target3 not found");
    if (!code.includes(target4)) console.log("Target4 not found");
}
