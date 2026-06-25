from flask import Flask, render_template

# Use __name__ so Flask can locate the templates/static folders correctly.
app = Flask(__name__)
# Application display name
app.name = "run01"

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)
