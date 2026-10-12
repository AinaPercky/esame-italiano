import streamlit as st
from services.api_client import api

st.set_page_config(page_title="Évaluation Orale", layout="wide")
st.title("🎙️ Évaluation Orale d'Italien")

classes = api.get_classes()
if not classes:
    st.warning("Veuillez d'abord créer une classe.")
    st.stop()

col_c, col_e = st.columns(2)
with col_c:
    class_map = {c["name"]: c["id"] for c in classes}
    sel_class_name = st.selectbox("1. Sélectionner la classe :", list(class_map.keys()))
    class_id = class_map[sel_class_name]

exams = api.get_exams(class_id=class_id)
if not exams:
    st.warning("Aucun examen configuré pour cette classe.")
    st.stop()

with col_e:
    exam_map = {e["title"]: e["id"] for e in exams}
    sel_exam_title = st.selectbox("2. Sélectionner l'examen :", list(exam_map.keys()))
    exam_id = exam_map[sel_exam_title]

exam = api.get_exam_by_id(exam_id)
students = api.get_students(class_id=class_id)

if not students:
    st.warning("Aucun élève dans cette classe.")
    st.stop()

student_map = {f"{s['first_name']} {s['last_name']} ({s.get('student_number') or 'Sans id'})": s["id"] for s in students}
sel_student_label = st.selectbox("3. Sélectionner l'élève à évaluer :", list(student_map.keys()))
student_id = student_map[sel_student_label]

st.divider()

# Chronomètre de parole (Section 5.3)
st.subheader("⏱️ Chronomètre de parole (3 minutes / 180s)")
col_t1, col_t2, col_t3 = st.columns([2, 2, 2])
with col_t1:
    speech_duration = st.slider("Durée de parole utilisée (secondes) :", min_value=0, max_value=180, value=150, step=5)
with col_t2:
    mins = speech_duration // 60
    secs = speech_duration % 60
    remaining = 180 - speech_duration
    st.metric("Temps écoulé", f"{mins:02d}:{secs:02d} / 03:00")
with col_t3:
    if remaining == 0:
        st.error("⏰ Temps de parole écoulé (3 min) !")
    elif remaining <= 30:
        st.warning(f"⚠️ Plus que {remaining}s restantes !")
    else:
        st.info(f"Temps restant : {remaining // 60:02d}:{remaining % 60:02d}")

st.progress(speech_duration / 180.0)
st.caption("* La durée de parole et la note sont deux éléments 100% indépendants.")

st.divider()

# Récupérer l'évaluation existante le cas échéant
evals = api.get_evaluations(exam_id=exam_id)
existing_eval = next((ev for ev in evals if ev["student_id"] == student_id), None)
prechecked_map = {}
if existing_eval and "details" in existing_eval:
    for d in existing_eval["details"]:
        prechecked_map[d["rubric_id"]] = d.get("is_validated", False)

st.subheader(f"Grille d'évaluation : {exam['title']}")
st.caption("Cochez les rubriques correctement formulées par l'élève en italien.")

rubrics = exam.get("rubrics", [])
checked_states = {}
total_live_score = 0.0

for r in rubrics:
    r_id = r["id"]
    default_val = prechecked_map.get(r_id, False)
    
    col_check, col_info, col_pts = st.columns([1, 8, 2])
    with col_check:
        is_chk = st.checkbox(f"#{r['position']}", value=default_val, key=f"rub_{student_id}_{r_id}")
        checked_states[r_id] = is_chk
        if is_chk:
            total_live_score += float(r.get("points", 1.0))
            
    with col_info:
        st.markdown(f"**{r['position']}. {r['title']}**")
        st.write(f"*Domanda:* {r.get('question', '')}")
        st.write(f"*Espressione attesa:* `{r.get('example_sentence', '')}`")
        
    with col_pts:
        pts = float(r.get("points", 1.0))
        st.write(f"Valeur : **{pts} pt**" if is_chk else f"Valeur : {pts} pt")
    st.divider()

max_score = sum(float(r.get("points", 1.0)) for r in rubrics)
pct = int((total_live_score / max_score) * 100) if max_score > 0 else 0

st.metric(
    label="Note calculée en direct",
    value=f"{int(total_live_score)} / {int(max_score)} points",
    delta=f"{pct} % de réussite"
)

if st.button("💾 Enregistrer l'évaluation", type="primary"):
    res = api.save_evaluation(exam_id, student_id, checked_states)
    st.success(f"Évaluation enregistrée avec succès ! Note attribuée : {int(total_live_score)} / {int(max_score)}")
