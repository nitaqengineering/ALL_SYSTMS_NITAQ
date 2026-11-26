# -*- coding: utf-8 -*-
"""يسحب الموديل المفتوح (بدون أي تعديل عليه) ويرفع عرض الفيلا ثلاثي الأبعاد، ثم يفتح رابطها وينسخه."""
import io
import json
import os
import re
import time

from pyrevit import revit, forms, script
from System.Diagnostics import Process, ProcessStartInfo

import nitaq_showcase as sc

doc = revit.doc
out = script.get_output()

cfg = sc.config()
if not cfg:
    forms.alert(u'الجهاز ده لسه مش متجهّز لرفع العروض.\n\nشغّل ملف التثبيت install.ps1 من فولدر إضافة نطاق، '
                u'وحط مفتاح المهندس اللي استلمته.', title=u'تحديث العرض', exitscript=True)

digits = re.findall(r'\d+', doc.Title)
slug = forms.ask_for_string(
    default='villa-' + digits[0] if digits else 'villa',
    prompt=u'اسم الفيلا في الرابط (حروف إنجليزية صغيرة وأرقام وشرطات):',
    title=u'تحديث العرض')
if not slug:
    script.exit()
slug = slug.strip().lower()
if not re.match(r'^[a-z0-9-]{1,60}$', slug):
    forms.alert(u'الاسم يكون حروف إنجليزية صغيرة وأرقام وشرطات فقط، مثل villa-4067.', exitscript=True)

work = os.path.join(sc.WORK, slug)
if not os.path.isdir(work):
    os.makedirs(work)
export_path = os.path.join(work, 'export.json')
mesh_path = os.path.join(work, 'mesh.json')


def run_node(args):
    info = ProcessStartInfo(sc.node(), args)
    info.WorkingDirectory = sc.TOOLS
    info.UseShellExecute = False
    info.CreateNoWindow = True
    info.RedirectStandardOutput = True
    info.RedirectStandardError = True
    p = Process.Start(info)
    o = p.StandardOutput.ReadToEnd()
    e = p.StandardError.ReadToEnd()
    p.WaitForExit()
    return p.ExitCode, o, e


started = time.time()
try:
    with forms.ProgressBar(title=u'تحديث العرض: قراءة الغرف والمستويات…') as bar:
        bar.update_progress(1, 4)
        data = sc.run_export(doc, 'showcase_export.py', {})
        text = json.dumps(data, ensure_ascii=False)
        with io.open(export_path, 'w', encoding='utf-8') as f:
            f.write(text if isinstance(text, type(u'')) else text.decode('utf-8'))
        bar.title = u'تحديث العرض: قراءة المجسّم والفرش والأبواب…'
        bar.update_progress(2, 4)
        stats = sc.run_export(doc, 'showcase_export_mesh.py', {'out': mesh_path})
        bar.title = u'تحديث العرض: تجهيز العرض…'
        bar.update_progress(3, 4)
        config = os.path.join(work, slug + '.config.json')
        code, o, e = run_node(u'showcase_build.mjs "{}" {} "{}" "{}" "{}"'.format(
            export_path, slug, config if os.path.isfile(config) else '-', mesh_path, work))
        if code != 0:
            raise Exception(u'تجهيز العرض:\n' + o + e)
        bar.title = u'تحديث العرض: الرفع على السحابة…'
        bar.update_progress(4, 4)
        code, o, e = run_node(u'showcase_publish.mjs upload {} "{}"'.format(slug, work))
        last = [l for l in o.splitlines() if l.strip().startswith('{')]
        res = json.loads(last[-1]) if last else {'ok': False, 'error': e or o}
        if not res.get('ok'):
            raise Exception(u'الرفع:\n' + (res.get('error') or e or o))
except Exception as err:
    out.print_md(u'**تعذّر تحديث العرض**\n\n```\n{}\n```'.format(err))
    forms.alert(u'تعذّر تحديث العرض. التفاصيل في نافذة pyRevit.', exitscript=True)

link = res['link']
try:
    from System.Windows.Forms import Clipboard
    Clipboard.SetText(link)
    copied = u' (اتنسخ، تقدر تلصقه مباشرة)'
except Exception:
    copied = u''
Process.Start(link)
out.print_md(u'**تم تحديث عرض {}** (نسخة {}) في {:.0f} ثانية: {} عنصر.\n\nالرابط{}:\n\n{}'.format(
    slug, res.get('version'), time.time() - started, (stats or {}).get('elements', '?'), copied, link))
