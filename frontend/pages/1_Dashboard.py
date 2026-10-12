import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from services.api_client import api

st.set_page_config(page_title="Dashboard Statistiques", layout="wide")
st.title("📊 Tableau de Bord Statistique")

exams = api.get_exams()
if not exams:
    st.warning("Aucun examen trouvé.")
    st.stop()

exam_options = {e["title"]: e["id"] for e in exams}
selected_title = st.selectbox("Sélectionnez un examen oral :", list(exam_options.keys()))
exam_id = exam_options[selected_title]

stats = api.get_exam_statistics(exam_id)

if stats:
    ind = stats["indicators"]
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Élèves dans la classe", ind["total_students"])
    c2.metric("Élèves évalués", ind["evaluated_students"])
    c3.metric("Non évalués", ind["unevaluated_students"])
    c4.metric("Moyenne de la classe", f"{ind['class_average']} / {stats['max_score']}")
    c5.metric("Note max / min", f"{ind['max_score']} / {ind['min_score']}")
    c6.metric("Taux de réussite", f"{ind['success_rate']} %")

    st.divider()

    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("Distribution des notes par tranche")
        dist_data = stats["charts"]["distribution"]
        df_dist = pd.DataFrame(dist_data)
        fig_dist = px.bar(df_dist, x="label", y="count", labels={"label": "Tranche de notes", "count": "Nombre d'élèves"}, color_discrete_sequence=["#0284c7"])
        st.plotly_chart(fig_dist, use_container_width=True)

    with col_right:
        st.subheader("Performance par rubrique (% de validation)")
        rub_data = stats["charts"]["rubric_performance"]
        df_rub = pd.DataFrame(rub_data)
        fig_rub = px.bar(df_rub, x="title", y="success_rate", labels={"title": "Rubrique en italien", "success_rate": "% Réussite"}, color="success_rate", color_continuous_scale="Viridis")
        fig_rub.update_layout(xaxis_tickangle=-45)
        st.plotly_chart(fig_rub, use_container_width=True)
else:
    st.info("Aucune statistique disponible pour cet examen.")
