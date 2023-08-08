const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initialize = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => console.log("Success"));
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initialize();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const SelectedUserQuery = `
    SELECT
     username
    FROM
     user
    WHERE 
     username = '${username}';`;
  const dbUser = await db.get(SelectedUserQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
                INSERT INTO
                user (name,username,password,gender)
                VALUES (
                    '${name}',
                    '${username}',
                    '${hashedPassword}',
                    '${gender}'
                );`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

/*app.get("/register/", async (request, response) => {
  const { username } = request;
  const getQuery = `
    SELECT * FROM user;`;
  const responseQuery = await db.all(getQuery);
  response.send(responseQuery);
});

app.delete("/register/:userId/", async (request, response) => {
  const { userId } = request.params;
  const { username } = request;
  const deleteQuery = `
    DELETE FROM user WHERE user_id = ${userId};`;
  await db.run(deleteQuery);
  response.send("DELETED");
});*/

//API - 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API - 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowersIdsQuery = `
  SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowersIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const getTweetsFeedQuery = `
          SELECT
            user.username,
            tweet.tweet,
            tweet.date_time AS dateTime
          FROM
            user INNER JOIN tweet ON user.user_id = tweet.user_id
          WHERE
            user.user_id in (${getFollowerIdsSimple})
          ORDER BY
            tweet.date_time DESC
          LIMIT 4;`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API - 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowersIdsQuery = `
  SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowersIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const userFollowsQuery = `
    SELECT
     name
    FROM
     user 
    WHERE
     user_id in (${getFollowerIdsSimple});`;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //console.log(getUserId);
  const getFollowersIdsQuery = `
  SELECT follower_user_id FROM follower WHERE following_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowersIdsQuery);
  //console.log(getFollowerIds);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  //console.log(getFollowerIdsSimple);
  const getFollowersNameQuery = `
    SELECT
     name
    FROM
     user 
    WHERE
     user_id in (${getFollowerIdsSimple});`;
  const getFollowerNamesArray = await db.all(getFollowersNameQuery);
  //console.log(getFollowerNamesArray);
  response.send(getFollowerNamesArray);
});

//API - 6

const tweetObjToResponseObj = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowersIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowersIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const tweetIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id in (${getFollowerIdsSimple});`;
  const getTweetIdsArray = await db.all(tweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `
        SELECT COUNT(user_id) as likes FROM like WHERE tweet_id = ${tweetId};`;
    const likes_count = await db.get(likes_count_query);
    const reply_count_query = `
        SELECT COUNT(user_id) as replies FROM reply WHERE tweet_id = ${tweetId};`;
    const reply_count = await db.get(reply_count_query);
    const tweet_tweetDataQuery = `
        SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweet_tweetData = await db.get(tweet_tweetDataQuery);
    response.send(
      tweetObjToResponseObj(tweet_tweetData, likes_count, reply_count)
    );
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API - 7

const convertLikedUserNameDbObjToResponseObj = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowersIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
    const getFollowerIds = await db.all(getFollowersIdsQuery);
    const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
      return eachUser.following_user_id;
    });
    const getTweetIdQuery = `
    SELECT tweet_id FROM tweet WHERE user_id in (${getFollowerIdsSimple});`;
    const getTweetIdsArray = await db.all(getTweetIdQuery);
    const getTweetIds = getTweetIdsArray.map((eachId) => {
      return eachId.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUserNameQuery = `
      SELECT user.username AS likes from user INNER JOIN like
      ON user.user_id = like.user_id WHERE like.tweet_id = ${tweetId};`;
      const getLikedUserNameArray = await db.all(getLikedUserNameQuery);
      const getLikedUserNames = getLikedUserNameArray.map((eachUser) => {
        return eachUser.likes;
      });
      response.send(convertLikedUserNameDbObjToResponseObj(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API - 8

const convertUserNameReplyDbObjToResponseObj = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowersIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id = ${getUserId.user_id};`;
    const getFollowerIds = await db.all(getFollowersIdsQuery);
    const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
      return eachUser.following_user_id;
    });
    const getTweetIdQuery = `
    SELECT tweet_id FROM tweet WHERE user_id in (${getFollowerIdsSimple});`;
    const getTweetIdsArray = await db.all(getTweetIdQuery);
    const getTweetIds = getTweetIdsArray.map((eachId) => {
      return eachId.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUserNameReplyQuery = `
      SELECT user.name, reply.reply from user INNER JOIN reply
      ON user.user_id = reply.user_id WHERE reply.tweet_id = ${tweetId};`;
      const getUserNameReplyArray = await db.all(getUserNameReplyQuery);
      response.send(
        convertUserNameReplyDbObjToResponseObj(getUserNameReplyArray)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API - 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getTweetsQuery = `
    SELECT
     tweet.tweet,
     COUNT(DISTINCT(like.like_id)) AS likes,
     COUNT(DISTINCT(reply.reply_id)) AS replies,
     tweet.date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
    WHERE 
     user.user_id = ${getUserId.user_id}
    GROUP BY
     tweet.tweet_id;`;
  const getTweetsArray = await db.all(getTweetsQuery);
  response.send(getTweetsArray);
});

//API - 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const createTweetQuery = `
  INSERT into tweet(tweet,user_id) VALUES("${tweet}",${getUserId.user_id});`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API - 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    console.log(getUserId);
    const getTweetIdQuery = `
    SELECT tweet_id FROM tweet WHERE user_id = ${getUserId.user_id};`;
    const getTweetIdsArray = await db.all(getTweetIdQuery);
    console.log(getTweetIdsArray);
    const getTweetIds = getTweetIdsArray.map((eachId) => {
      return eachId.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
