document.addEventListener("DOMContentLoaded", function() {
    function fetchNotifications() {
        fetch('/api/get_notifications')
            .then(response => {
                if (!response.ok) return { status: 'error' };
                return response.json();
            })
            .then(data => {
                if(data.status === 'success') {
                    const badge = document.getElementById('notif-badge');
                    if(badge) {
                        if(data.unread_count > 0) {
                            badge.textContent = window.toPersianDigits ? window.toPersianDigits(data.unread_count) : data.unread_count;
                            badge.style.display = 'inline-block';
                        } else {
                            badge.style.display = 'none';
                        }
                    }
                }
            })
            .catch(error => { });
    }

    fetchNotifications();
    setInterval(fetchNotifications, 60000);

    function fetchStudioInfo() {
        const cached = localStorage.getItem('asva_studio_info');
        if (cached) {
            updateStudioUI(JSON.parse(cached));
        }
        
        fetch('/api/get_studio_info')
            .then(res => res.json())
            .then(result => {
                if(result.status === 'success' && result.data) {
                    localStorage.setItem('asva_studio_info', JSON.stringify(result.data));
                    updateStudioUI(result.data);
                }
            })
            .catch(e => { /* Silently catch network error for studio info */ });
    }
    
    function updateStudioUI(data) {
        if(data.name) {
            const el = document.getElementById('sidebarStudioName');
            if(el) el.innerText = data.name;
        }
    }
    fetchStudioInfo();

});


// Override default window.alert globally!
window.alert = function(msg) {
    window.showToast(msg, 'info');
};


// --- Global Loader and Unified Error Handling ---
document.addEventListener("DOMContentLoaded", function() {
    // Add global loader overlay if it doesn't exist
    if (!document.getElementById('global-loader-overlay')) {
        const loaderHTML = `
        <div id="global-loader-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(4px); z-index: 2147483647 !important; display: flex; flex-direction: column; align-items: center; justify-content: center; visibility: hidden; opacity: 0; transition: opacity 0.2s;">
            <div style="border: 4px solid rgba(79, 70, 229, 0.2); border-top: 4px solid var(--primary-color); border-radius: 50%; width: 50px; height: 50px; animation: global-spin 1s linear infinite; margin-bottom: 15px;"></div>
            <div style="font-weight: bold; color: var(--text-dark); font-size: 1.1rem;" id="global-loader-text">لطفا کمی صبر کنید...</div>
        </div>
        <style>@keyframes global-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;
        document.body.insertAdjacentHTML('beforeend', loaderHTML);
    }
});

window.showLoading = function(text = 'لطفا کمی صبر کنید...') {
    const loader = document.getElementById('global-loader-overlay');
    const loaderText = document.getElementById('global-loader-text');
    if (loader && loaderText) {
        loaderText.innerText = text;
        loader.style.visibility = 'visible';
        loader.style.opacity = '1';
    }
};

window.hideLoading = function() {
    const loader = document.getElementById('global-loader-overlay');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.visibility = 'hidden'; }, 200);
    }
};

// Monkey-patch window.fetch to automatically show/hide loader and handle network errors
const originalFetch = window.fetch;
let activeFetches = 0;
window.fetch = async function(...args) {
    const url = args[0];
    
    // Don't show loader for background polling
    const isBackground = typeof url === 'string' && (url.includes('get_notifications') || url.includes('get_studio_info'));
    
    if (!isBackground) {
        activeFetches++;
        window.showLoading();
    }
    
    try {
        const response = await originalFetch.apply(this, args);
        return response;
    } catch (error) {
        if (!isBackground) {
            window.showToast('خطا در ارتباط با سرور', 'error');
        }
        throw error;
    } finally {
        if (!isBackground) {
            activeFetches--;
            if (activeFetches <= 0) {
                activeFetches = 0;
                window.hideLoading();
            }
        }
    }
};


// --- Responsive Tables & Search/Filters ---
document.addEventListener("DOMContentLoaded", function() {
    // 1. Wrap tables for responsiveness
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        if (!table.parentElement.classList.contains('table-responsive')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-responsive';
            wrapper.style.width = '100%';
            wrapper.style.overflowX = 'auto';
            wrapper.style.WebkitOverflowScrolling = 'touch';
            wrapper.style.marginBottom = '20px';
            wrapper.style.border = '1px solid #e2e8f0';
            wrapper.style.borderRadius = '8px';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
            table.style.marginBottom = '0'; // Remove inner margin
            table.style.border = 'none'; // Remove inner border to avoid double borders
        }
    });

    // Setup Empty States on Page Load
    

    // 2. Setup Global Search (Debounced)
    const searchInputs = document.querySelectorAll('.global-search-input');
    searchInputs.forEach(input => {
        let timeout = null;
        input.addEventListener('input', function(e) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const query = e.target.value.trim().toLowerCase();
                const targetTableId = input.getAttribute('data-target');
                if (targetTableId) {
                    const tbody = document.querySelector(targetTableId + ' tbody') || document.querySelector(targetTableId);
                    if (tbody) {
                        const rows = tbody.querySelectorAll('tr, .searchable-item');
                        let visibleCount = 0;
                        rows.forEach(row => {
                            if (row.innerText.toLowerCase().includes(query)) {
                                row.style.display = '';
                                visibleCount++;
                            } else {
                                row.style.display = 'none';
                            }
                        });
                        
                        // Handle Empty State
                        let emptyRow = tbody.querySelector('.empty-state-row, .empty-state-item');
                        if (visibleCount === 0) {
                            if (!emptyRow) {
                                emptyRow = document.createElement(tbody.tagName.toLowerCase() === 'tbody' ? 'tr' : 'div');
                                emptyRow.className = tbody.tagName.toLowerCase() === 'tbody' ? 'empty-state-row' : 'empty-state-item';
                                if (tbody.tagName.toLowerCase() === 'tbody') {
                                    const thead = tbody.parentElement.querySelector('thead tr');
                                    const colCount = thead ? thead.children.length : 1;
                                    emptyRow.innerHTML = `<td colspan="${colCount}" style="text-align: center; padding: 40px; color: var(--text-gray); font-size: 1.1rem; background: var(--card-bg);">موردی یافت نشد</td>`;
                                } else {
                                    emptyRow.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-gray); font-size: 1.1rem; background: var(--card-bg); border-radius: 8px; border: 1px dashed var(--border-color);">موردی یافت نشد</div>`;
                                }
                                tbody.appendChild(emptyRow);
                            }
                            emptyRow.style.display = '';
                        } else if (emptyRow) {
                            emptyRow.style.display = 'none';
                        }
                    }
                }
            }, 300); // 300ms debounce
        });
    });
});


window.customConfirm = function(message) {
    return new Promise((resolve) => {
        let overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0'; overlay.style.bottom = '0';
        
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '2147483647';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        
        let box = document.createElement('div');
        box.style.backgroundColor = 'var(--card-bg, #fff)';
        box.style.padding = '25px';
        box.style.borderRadius = '15px';
        box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
        box.style.maxWidth = '400px';
        box.style.width = '90%';
        box.style.textAlign = 'center';
        
        let text = document.createElement('p');
        text.innerText = message;
        text.style.marginBottom = '25px';
        text.style.color = 'var(--text-color, #333)';
        text.style.fontSize = '1.05rem';
        text.style.lineHeight = '1.6';
        
        let btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '15px';
        
        let btnYes = document.createElement('button');
        btnYes.innerText = 'بله، مطمئنم';
        btnYes.style.flex = '1';
        btnYes.style.padding = '10px';
        btnYes.style.background = "linear-gradient(135deg, var(--primary-color), #8b5cf6, #ec4899) !important";
        btnYes.style.color = 'white';
        btnYes.style.border = "none"; btnYes.className = "btn-primary";
        btnYes.style.borderRadius = '8px';
        btnYes.style.cursor = 'pointer';
        
        let btnNo = document.createElement('button');
        btnNo.innerText = 'انصراف';
        btnNo.style.flex = '1';
        btnNo.style.padding = '10px';
        btnNo.style.backgroundColor = 'transparent';
        btnNo.style.color = 'var(--text-gray, #666)';
        btnNo.style.border = "1px solid var(--border-color, #eee)"; btnNo.className = "btn-outline";
        btnNo.style.borderRadius = '8px';
        btnNo.style.cursor = 'pointer';
        
        btnYes.onclick = () => { document.body.removeChild(overlay); resolve(true); };
        btnNo.onclick = () => { document.body.removeChild(overlay); resolve(false); };
        
        btnContainer.appendChild(btnNo);
        btnContainer.appendChild(btnYes);
        
        box.appendChild(text);
        box.appendChild(btnContainer);
        overlay.appendChild(box);
        
        document.body.appendChild(overlay);
    });
};
