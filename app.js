/**
 * Module dependencies.
 */

var express = require("express");
var hash = require("pbkdf2-password")();
var path = require("path");
var session = require("express-session");
const cors = require("cors");

var app = (module.exports = express());

// config

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// middleware

app.use(cors());
app.use("/static", express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // don't create session until something stored
    secret: "shhhh, very secret",
    cookie: {
      secure: false,
      httpOnly: true,
      domain: "hasura-example.localhost"
    }
  })
);

// Session-persisted message middleware

app.use(function(req, res, next) {
  console.log("req.session.error", req.session.error);

  var err = req.session.error;
  var msg = req.session.success;
  delete req.session.error;
  delete req.session.success;
  res.locals.message = "";
  if (err) res.locals.message = '<p class="msg error">' + err + "</p>";
  if (msg) res.locals.message = '<p class="msg success">' + msg + "</p>";
  next();
});

// dummy database

var users = {
  foo: { name: "foo" }
};

// when you create a user, generate a salt
// and hash the password ('bar' is the pass here)

hash({ password: "bar" }, function(err, pass, salt, hash) {
  if (err) throw err;
  // store the salt & hash in the "db"
  users.foo.salt = salt;
  users.foo.hash = hash;
});

// Authenticate using our plain-object database of doom!

function authenticate(name, pass, fn) {
  if (!module.parent) console.log("authenticating %s:%s", name, pass);
  var user = users[name];
  // query the db for the given username
  if (!user) return fn(new Error("cannot find user"));
  // apply the same algorithm to the POSTed password, applying
  // the hash against the pass / salt, if there is a match we
  // found the user
  hash({ password: pass, salt: user.salt }, function(err, pass, salt, hash) {
    if (err) return fn(err);
    if (hash === user.hash) return fn(null, user);
    fn(new Error("invalid password"));
  });
}

app.get("/auth", (req, res) => {
  if (req.session.user) {
    const hasuraVariables = {
      "X-Hasura-Role": "user"
    };
    res.json(hasuraVariables);
  } else {
    res.sendStatus(401);
  }
});

app.post("/logout", function(req, res) {
  // destroy the user's session to log them out
  // will be re-created next request
  req.session.destroy(function() {
    res.redirect("/");
  });
});

app.get("/", function(req, res) {
  res.locals.user = req.session.user;
  res.render("index");
});

app.post("/login", function(req, res) {
  authenticate(req.body.username, req.body.password, function(err, user) {
    if (user) {
      // Regenerate session when signing in
      // to prevent fixation
      req.session.regenerate(function() {
        // Store the user's primary key
        // in the session store to be retrieved,
        // or in this case the entire user object
        req.session.user = user;
        res.redirect("/");
      });
    } else {
      req.session.error =
        "Authentication failed, please check your " +
        " username and password." +
        ' (use "foo" and "bar")';
      res.redirect("/");
    }
  });
});

/* istanbul ignore next */
if (!module.parent) {
  app.listen(3000);
  console.log("Express started on port 3000");
}
