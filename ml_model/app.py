from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd

app = Flask(__name__)
CORS(app)  # allow your website's JS to call this from a different origin

model = joblib.load('model.pkl')

REQUIRED_FIELDS = [
    'city', 'state', 'hour', 'day_of_week', 'is_weekend', 'road_type',
    'lanes', 'traffic_signal', 'weather', 'visibility', 'temperature',
    'traffic_density', 'is_peak_hour', 'festival'
]

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)

    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    row = pd.DataFrame([{f: data[f] for f in REQUIRED_FIELDS}])
    row = pd.get_dummies(row).reindex(columns=model.feature_names_in_, fill_value=0)

    pred = model.predict(row)[0]
    proba = model.predict_proba(row)[0]
    classes = model.classes_.tolist()

    return jsonify({
        "risk": pred,
        "probabilities": dict(zip(classes, [round(float(p), 4) for p in proba]))
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)