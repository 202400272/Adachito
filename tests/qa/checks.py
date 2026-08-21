from .legacy import (
    test_json, test_locale_consistency, test_routes, test_source_integrity,
    test_accessibility_basics, test_html, test_assets, test_js, test_build,
)

def static_results(timed):
    out=[]
    out.append(timed(test_json,"Data","Site data"))
    out.append(timed(test_locale_consistency,"Data","Translations"))
    out.append(timed(test_routes,"Structure","Pages"))
    integrity=test_source_integrity()
    names=["Links","Missing files","Image descriptions","Duplicate IDs","Page anchors"]
    for r,n in zip(integrity,names):
        r.category="HTML"; r.name=n; out.append(r)
    out.append(timed(test_accessibility_basics,"Accessibility","Basic accessibility"))
    out.append(timed(test_html,"HTML","Page basics"))
    out.append(timed(test_assets,"Assets","Large files"))
    out.append(timed(test_js,"JavaScript","JavaScript syntax"))
    return out
