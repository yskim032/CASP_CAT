with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = '                <div class="tab" data-tab="simulation">Berth Simulation</div>\n            </div>'
new = ('                <div class="tab" data-tab="simulation">Berth Simulation</div>\n'
       '                <div class="tab" data-tab="history" '
       'style="margin-left:auto;border-left:1px solid var(--glass-border);padding-left:18px;">'
       '&#128336; History</div>\n            </div>')

if old in content:
    content = content.replace(old, new, 1)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: History tab added')
else:
    print('NOT FOUND - checking line endings...')
    idx = content.find('Berth Simulation')
    print(repr(content[idx-20:idx+80]))
