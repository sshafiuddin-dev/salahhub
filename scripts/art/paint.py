# The two watercolours on the Quran player's Now playing card (art/kaaba.webp for Makki surahs, art/nabawi.webp for Madani),
# drawn for Iqama Times from simple shapes, with SVG filters for the paint. Run it to write the SVGs beside this file, open
# each in Chrome at 800×800, take a screenshot, and save it as a 720×720 WebP (quality 80) in art/. The app ships the WebP
# only, so the tablet shows a picture and does not work out the filters itself.
import os
HERE = os.path.dirname(os.path.abspath(__file__))
import random, math
def defs(oil):
    wc = '''<filter id="wc" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="3"/><feDisplacementMap in="SourceGraphic" scale="7"/><feGaussianBlur stdDeviation="0.6"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="14"/><feGaussianBlur stdDeviation="3"/></filter>
<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 -1.4 1.1"/></filter>'''
    oilf = '''<filter id="oil" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.06 0.16" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6" result="d"/>
<feTurbulence type="turbulence" baseFrequency="0.035 0.3" numOctaves="2" seed="8" result="s"/><feDiffuseLighting in="s" surfaceScale="0.9" lighting-color="#fff" result="l"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>
<feComposite in="d" in2="l" operator="arithmetic" k1="0.55" k2="0.5" k3="0" k4="0"/></filter>'''
    return '<defs>' + wc + (oilf if oil else '') + '</defs>'
def dabs(rng, cx, cy, rings, n, cols, rmin=1.6, rmax=3.2):
    out=''
    for k,(rx,ry) in enumerate(rings):
        for i in range(n):
            a=rng.uniform(0,2*math.pi); x=cx+math.cos(a)*rx*rng.uniform(.85,1.1); y=cy+math.sin(a)*ry*rng.uniform(.8,1.15)
            r=rng.uniform(rmin,rmax)*(0.75+0.5*(y-cy+ry)/(2*ry))
            out+=f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r*1.25:.1f}" fill="{rng.choice(cols)}" opacity="{rng.uniform(.6,.95):.2f}"/>'
    return out
def sky(top, mid, low):
    return (f'<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset=".5" stop-color="{mid}"/><stop offset=".75" stop-color="{low}"/></linearGradient></defs>'
        f'<rect width="400" height="400" fill="url(#sk)"/>'
        f'<g filter="url(#soft)"><ellipse cx="90" cy="60" rx="120" ry="28" fill="#ffffff" opacity=".28"/><ellipse cx="300" cy="105" rx="140" ry="24" fill="#ffffff" opacity=".22"/>'
        f'<ellipse cx="250" cy="200" rx="120" ry="40" fill="#fff3d6" opacity=".55"/><ellipse cx="60" cy="25" rx="160" ry="60" fill="{top}" opacity=".5"/></g>')
def minaret(x, base, top, w, body, cap, accent):
    s=f'<rect x="{x-w/2}" y="{top+18}" width="{w}" height="{base-top-18}" fill="{body}"/>'
    for t in (0.35,0.62):
        y=top+18+(base-top-18)*t; s+=f'<rect x="{x-w/2-3}" y="{y:.0f}" width="{w+6}" height="5" fill="{body}" stroke="{accent}" stroke-width=".8"/>'
    s+=f'<path d="M{x-w/2-1} {top+18} L{x} {top} L{x+w/2+1} {top+18} Z" fill="{cap}"/><path d="M{x} {top} V{top-8}" stroke="#c99a3a" stroke-width="1.4"/><circle cx="{x}" cy="{top-10}" r="2" fill="#d9ad4c"/>'
    return s
def kaaba(oil):
    rng=random.Random(7)
    s=sky('#5f78a8','#e9a878','#f6d9ae') if not oil else sky('#3d5a95','#e48d55','#f4c98f')
    arc='<g filter="url(#wc)">'
    arc+=f'<rect x="0" y="222" width="400" height="70" fill="{"#e6d6b8" if not oil else "#dcc59b"}"/>'
    for i in range(14):
        x=8+i*29; arc+=f'<path d="M{x} 286 V250 Q{x+11} 234 {x+22} 250 V286 Z" fill="{"#c7ae86" if not oil else "#b89463"}" opacity=".8"/>'
    arc+=f'<rect x="0" y="216" width="400" height="9" fill="{"#d3bf9b" if not oil else "#c4a575"}"/>'
    for x,t in ((30,95),(78,120),(330,118),(372,92)):
        arc+=minaret(x,222,t,10,'#efe3cb' if not oil else '#e8d3a8','#cdb998' if not oil else '#b8955c','#a8916c')
    arc+='</g>'
    floor=f'<g filter="url(#wc)"><path d="M0 285 Q200 262 400 285 V400 H0 Z" fill="{"#f7f1e6" if not oil else "#efe4cf"}"/><ellipse cx="200" cy="330" rx="185" ry="48" fill="{"#ece2d0" if not oil else "#e0cfb0"}" opacity=".7"/></g>'
    people=dabs(rng,200,318,[(150,36),(125,29),(172,44),(100,22)],70,['#fbfaf6','#f2eee6','#e9e4da','#cfc8bb','#ffffff','#b9b0a2'])
    face_l='#1f1c22' if not oil else '#17141a'; face_r='#34303a' if not oil else '#2c2731'; top='#4a4552' if not oil else '#3f3946'
    gold='#c99a3a' if not oil else '#d8a53e'
    k=(f'<g filter="url(#wc)"><path d="M118 168 L196 182 L196 318 L118 304 Z" fill="{face_l}"/>'
       f'<path d="M196 182 L284 162 L284 298 L196 318 Z" fill="{face_r}"/><path d="M118 168 L196 182 L284 162 L206 151 Z" fill="{top}"/>'
       f'<path d="M118 196 L196 210 L196 222 L118 208 Z" fill="{gold}"/><path d="M196 210 L284 190 L284 202 L196 222 Z" fill="{gold}"/>'
       f'<path d="M212 236 L236 231 L236 287 L212 292 Z" fill="{gold}"/><path d="M216 241 L232 237.5 L232 282 L216 286 Z" fill="#8e6a24" opacity=".6"/><path d="M224 240 V284" stroke="#e8c46a" stroke-width="1"/><path d="M212 292 L236 287 L236 291 L212 296 Z" fill="#7d6a52"/></g>')
    script=''.join(f'<path d="M{x:.0f} {y:.1f} q2 -3 4 0 t4 0" stroke="#5e4416" stroke-width=".9" fill="none"/>' for x,y in [(122+i*9, 201.5+i*1.6) for i in range(8)]+[(202+i*10, 213-i*2.3) for i in range(8)])
    hijr='<g filter="url(#wc)"><path d="M104 296 Q62 300 66 318 Q74 336 118 334" fill="none" stroke="#efe6d6" stroke-width="7"/><path d="M104 296 Q62 300 66 318 Q74 336 118 334" fill="none" stroke="#c9b79b" stroke-width="1.2" opacity=".8"/></g>'
    shade='<g filter="url(#soft)"><ellipse cx="200" cy="320" rx="95" ry="12" fill="#6b5d4a" opacity=".35"/></g>'
    return s+arc+floor+shade+hijr+k+script+people
def nabawi(oil):
    rng=random.Random(11)
    s=sky('#6c8fc2','#f0b27a','#f8dfb6') if not oil else sky('#456fb0','#ec9a55','#f6cf95')
    wall='#f1e6cf' if not oil else '#ead6ad'; arch='#cdb592' if not oil else '#bd9a66'
    g=f'<g filter="url(#wc)"><rect x="0" y="232" width="400" height="66" fill="{wall}"/>'
    for i in range(13):
        x=10+i*30; g+=f'<path d="M{x} 292 V256 Q{x+11} 240 {x+22} 256 V292 Z" fill="{arch}" opacity=".85"/>'
    g+=f'<rect x="0" y="226" width="400" height="8" fill="{arch}"/>'
    g+=minaret(52,232,52,13,wall,'#e8dcc2' if not oil else '#dcc59a',arch)+minaret(352,232,64,13,wall,'#e8dcc2' if not oil else '#dcc59a',arch)
    g+=f'<rect x="150" y="188" width="100" height="44" fill="{wall}"/>'
    for i in range(5): g+=f'<path d="M{156+i*19} 226 V206 Q{163+i*19} 197 {170+i*19} 206 V226 Z" fill="{arch}"/>'
    dome='#3f8f5a' if not oil else '#2f8a4c'; lite='#79bd86' if not oil else '#5fbf75'; dark='#2d6b43' if not oil else '#1f6638'
    g+=(f'<path d="M146 190 C146 142 184 120 200 108 C216 120 254 142 254 190 Z" fill="{dome}"/>'
        f'<path d="M160 186 C160 150 186 130 198 118 C192 140 182 160 180 186 Z" fill="{lite}" opacity=".7"/>'
        f'<path d="M226 186 C228 160 222 140 212 124 C236 142 246 160 246 186 Z" fill="{dark}" opacity=".6"/>'
        f'<rect x="143" y="186" width="114" height="6" fill="{dark}"/></g>')
    fin='<path d="M200 108 V84" stroke="#c99a3a" stroke-width="2"/><circle cx="200" cy="100" r="3" fill="#d9ad4c"/><circle cx="200" cy="92" r="2.4" fill="#d9ad4c"/><path d="M196 80 a5 5 0 1 0 8 0 a4 4 0 1 1 -8 0" fill="#d9ad4c"/>'
    floor=f'<g filter="url(#wc)"><path d="M0 294 Q200 280 400 294 V400 H0 Z" fill="{"#f7f2e8" if not oil else "#efe5d1"}"/></g>'
    def palm(x, y, h, c):
        t=f'<path d="M{x} {y} Q{x+5} {y-h/2} {x+2} {y-h}" stroke="#8a6a44" stroke-width="5" fill="none"/>'
        for a2 in (-175,-150,-128,-105,-80,-55,-32,-8,160,20):
            r=math.radians(a2); ex=x+2+math.cos(r)*34; ey=y-h+math.sin(r)*20+14
            t+=f'<path d="M{x+2} {y-h} Q{(x+2+ex)/2} {y-h-12} {ex:.0f} {ey:.0f}" stroke="{c}" stroke-width="6" stroke-linecap="round" fill="none"/>'
            t+=f'<path d="M{x+2} {y-h} Q{(x+2+ex)/2} {y-h-12} {ex:.0f} {ey:.0f}" stroke="#86b06a" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".7"/>'
        t+=f'<circle cx="{x+4}" cy="{y-h+5}" r="3" fill="#9a6b2f"/><circle cx="{x-1}" cy="{y-h+6}" r="2.6" fill="#9a6b2f"/>'
        return t
    pc='#5c8a4a' if not oil else '#3f7d36'
    umb='<g filter="url(#wc)">'+palm(22,330,70,pc)+palm(370,336,64,pc)+palm(318,342,46,pc)+'</g>'
    people=dabs(rng,200,372,[(170,14),(130,10),(185,22)],45,['#fbfaf6','#e9e4da','#cfc8bb','#ffffff','#8f8676','#5d6b7a'])
    return s+g+fin+floor+umb+people
def svg(body, oil):
    paper='<rect width="400" height="400" filter="url(#paper)" opacity=".5" style="mix-blend-mode:multiply"/>' if not oil else ''
    inner=f'<g filter="url(#oil)">{body}</g>' if oil else body
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800">{defs(oil)}{inner}{paper}</svg>'
for name,fn in (('kaaba',kaaba),('nabawi',nabawi)):
    for oil in (False,True):
        open(os.path.join(HERE, f'{name}-{"oil" if oil else "water"}.svg'),'w').write(svg(fn(oil),oil))
