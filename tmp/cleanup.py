import os

file_path = r'c:\Users\genco\Desktop\lavoro\w4uN8N\server\index.cjs'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. EPUB Cleanup
# Find the start of EPUB export
epub_start = -1
for i, line in enumerate(lines):
    if 'app.post("/export/epub"' in line:
        epub_start = i
        break

if epub_start != -1:
    # Find and remove Copyright block
    # It starts with // Copyright or similar after my previous edits
    copy_start = -1
    for i in range(epub_start, epub_start + 100):
        if '// Copyright' in lines[i]:
            copy_start = i
            break
    
    if copy_start != -1:
        # Remove from copy_start to the next }); which should be the end of the splice
        copy_end = -1
        for i in range(copy_start, copy_start + 20):
            if '});' in lines[i]:
                copy_end = i
                break
        
        if copy_end != -1:
            print(f"Removing lines {copy_start+1} to {copy_end+1} (EPUB Copyright)")
            del lines[copy_start:copy_end+1]
            
            # Now fix the introduction splice index from 2 to 1
            for i in range(copy_start, copy_start + 20):
                if 'content.splice(2, 0, {' in lines[i]:
                    print(f"Fixing Introduction splice index at line {i+1}")
                    lines[i] = lines[i].replace('splice(2, 0, {', 'splice(1, 0, {')
                    break

# 2. DOCX Cleanup
docx_start = -1
for i, line in enumerate(lines):
    if 'app.post("/export/docx"' in line:
        docx_start = i
        break

if docx_start != -1:
    copy_start = -1
    for i in range(docx_start, docx_start + 200):
        if '// --- COPYRIGHT PAGE ---' in lines[i]:
            copy_start = i
            break
    
    if copy_start != -1:
        copy_end = -1
        for i in range(copy_start, copy_start + 50):
            if ');' in lines[i] and 'children.push' not in lines[i]: # End of children.push(...)
                # Check if it's the end of copyright page block
                if i + 1 < len(lines) and 'pageBreakBefore: true' in lines[i-1]:
                    copy_end = i
                    break
        
        if copy_end != -1:
            print(f"Removing lines {copy_start+1} to {copy_end+1} (DOCX Copyright)")
            del lines[copy_start:copy_end+1]

# 3. PDF Cleanup
pdf_start = -1
for i, line in enumerate(lines):
    if 'app.post("/export/pdf"' in line:
        pdf_start = i
        break

if pdf_start != -1:
    copy_start = -1
    for i in range(pdf_start, pdf_start + 200):
        if '<div class="title-page" style="margin-top: 10%;">' in lines[i]:
            copy_start = i
            break
    
    if copy_start != -1:
        copy_end = -1
        for i in range(copy_start, copy_start + 30):
            if '</div>' in lines[i]:
                copy_end = i
                break
        
        if copy_end != -1:
            print(f"Removing lines {copy_start+1} to {copy_end+1} (PDF Copyright)")
            del lines[copy_start:copy_end+1]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done.")
