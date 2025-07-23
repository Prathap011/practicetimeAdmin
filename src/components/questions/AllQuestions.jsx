import React, { useEffect, useState, useRef } from "react";
import { database } from "../firebase/FirebaseSetup";
import { ref, get, remove, update, serverTimestamp } from "firebase/database";
import supabase from "../supabase/SupabaseConfig";
import { ToastContainer, toast } from "react-toastify";
import parse from "html-react-parser";
import JoditEditor from "jodit-react";
import DynamicMathSelector from "../DynamicMathSelector";
import "./AllQuestions.css";
import "../upload/Upload.css";

const AllQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [error, setError] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false); // Prevents re-fetch

  // Filters (start as "all")
  const [grade, setGrade] = useState("all");
  const [topic, setTopic] = useState("all");
  const [topicList, setTopicList] = useState("all");
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [questionType, setQuestionType] = useState("all");

  // Check if any filter is active
  const isAnyFilterActive = () => {
    return (
      grade !== "all" ||
      topic !== "all" ||
      topicList !== "all" ||
      difficultyLevel !== "all" ||
      questionType !== "all"
    );
  };

  // Fetch questions only when any filter is changed from "all"
  useEffect(() => {
    const shouldFetch = isAnyFilterActive() && !hasFetched && !loading;

    if (shouldFetch) {
      fetchAllQuestions();
    }
  }, [grade, topic, topicList, difficultyLevel, questionType, hasFetched, loading]);

  const fetchAllQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const questionsRef = ref(database, "questions");
      const snapshot = await get(questionsRef);

      if (!snapshot.exists()) {
        setError("No questions found in the database.");
        setQuestions([]);
        setFilteredQuestions([]);
        setHasFetched(true);
        setLoading(false);
        return;
      }

      const data = snapshot.val();
      const allFetchedQuestions = Object.entries(data)
        .map(([id, question]) => ({ id, ...question }))
        .reverse(); // newest first

      setQuestions(allFetchedQuestions);
      setFilteredQuestions(allFetchedQuestions);
      setHasFetched(true);
    } catch (err) {
      console.error("Error fetching questions:", err);
      setError("Failed to load questions. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Apply filters after questions are loaded
  useEffect(() => {
    if (!hasFetched) return;

    const filtered = questions.filter((q) => (
      (grade === "all" || q.grade === grade) &&
      (topic === "all" || q.topic === topic) &&
      (topicList === "all" || q.topicList === topicList) &&
      (difficultyLevel === "all" || q.difficultyLevel === difficultyLevel) &&
      (questionType === "all" || q.type === questionType)
    ));
    setFilteredQuestions(filtered);
  }, [questions, grade, topic, topicList, difficultyLevel, questionType, hasFetched]);

  const handleEdit = (question) => setEditingQuestion(question);

  const handleDelete = async (question) => {
    const { id, questionImage, options, correctAnswer } = question;
    await Promise.all([
      deleteImageFromSupabase(questionImage),
      ...(options?.map((opt) => deleteImageFromSupabase(opt.image)) || []),
      deleteImageFromSupabase(correctAnswer?.image),
    ]);
    try {
      await remove(ref(database, `questions/${id}`));
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setFilteredQuestions((prev) => prev.filter((q) => q.id !== id));
      toast.success("Question deleted successfully");
    } catch (err) {
      console.error("Error deleting question:", err);
      setError("Failed to delete question");
    }
  };

  const deleteImageFromSupabase = async (url) => {
    if (!url) return;
    const filePath = url.split("public/questions/")[1];
    try {
      const { error } = await supabase.storage.from("questions").remove([filePath]);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to delete image from Supabase:", err);
    }
  };

  const isHTML = (str) => /<[^>]+>/.test(str);

  // Upload/Edit Component
  const UploadComponent = ({ questionData, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
      questionType: questionData?.type || "MCQ",
      question: questionData?.question || "",
      questionImageUrl: questionData?.questionImage || null,
      options:
        questionData?.options?.map((opt) => ({
          text: opt.text || "",
          image: opt.image || null,
        })) || Array(4).fill({ text: "", image: null }),
      correctAnswer: questionData?.correctAnswer || { text: "", image: null },
      grade: questionData?.grade || "",
      topic: questionData?.topic || "",
      topicList: questionData?.topicList || "",
      difficultyLevel: questionData?.difficultyLevel || "",
    });

    const [loading, setLoading] = useState(false);
    const editor = useRef(null);

    const config = {
      readonly: false,
      toolbar: true,
      placeholder: "Enter your question here...",
      enter: "BR",
      removeButtons: "source",
      fullpage: false,
      cleanHTML: true,
      sanitize: true,
      autofocus: true,
      askBeforePasteHTML: false,
    };

    const uploadImageToSupabase = async (file) => {
      if (!file) return null;
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { data, error } = await supabase.storage.from("questions").upload(fileName, file);
      return error ? null : supabase.storage.from("questions").getPublicUrl(fileName).data.publicUrl;
    };

    const handleImageChange = async (e, field, index) => {
      const file = e.target.files[0];
      const url = await uploadImageToSupabase(file);
      if (!url) return;

      setFormData((prev) => {
        if (field === "questionImageUrl") {
          return { ...prev, questionImageUrl: url };
        }
        if (field === "options") {
          const newOptions = [...prev.options];
          newOptions[index].image = url;
          return { ...prev, options: newOptions };
        }
        return { ...prev, correctAnswer: { ...prev.correctAnswer, image: url } };
      });
    };

    const handleSave = async () => {
      if (!formData.question && !formData.questionImageUrl) {
        toast.error("Please enter a question or upload an image");
        return;
      }
      if (!questionData?.id) {
        toast.error("Invalid question ID. Cannot update.");
        return;
      }

      setLoading(true);
      try {
        const questionRef = ref(database, `questions/${questionData.id}`);
        const updatedData = {
          question: formData.question || "",
          questionImage: formData.questionImageUrl || "",
          options: Array.isArray(formData.options)
            ? formData.options.map((opt) => ({
                text: opt.text || "",
                image: opt.image || "",
              }))
            : [],
          correctAnswer: {
            text: formData.correctAnswer?.text || "",
            image: formData.correctAnswer?.image || "",
          },
          grade: formData.grade || "",
          topic: formData.topic || "",
          topicList: formData.topicList || "",
          difficultyLevel: formData.difficultyLevel || "",
          timestamp: serverTimestamp(),
          date: new Date().toISOString().split("T")[0],
          type: formData.questionType || "",
        };

        await update(questionRef, updatedData);

        setQuestions((prev) =>
          prev.map((q) => (q.id === questionData.id ? { ...q, ...updatedData } : q))
        );
        setFilteredQuestions((prev) =>
          prev.map((q) => (q.id === questionData.id ? { ...q, ...updatedData } : q))
        );

        toast.success("Question updated successfully");
        onSave();
      } catch (err) {
        console.error("Error updating question:", err);
        toast.error("Failed to update question");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="uploadContainer editMode">
        <h3>Edit Question</h3>
        <select
          value={formData.questionType}
          onChange={(e) => setFormData({ ...formData, questionType: e.target.value })}
        >
          <option value="MCQ">MCQ</option>
          <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
          <option value="TRIVIA">Trivia</option>
        </select>

        <JoditEditor
          ref={editor}
          value={formData.question}
          config={config}
          onBlur={(content) => setFormData({ ...formData, question: content })}
        />

        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleImageChange(e, "questionImageUrl")}
        />
        {formData.questionImageUrl && (
          <img
            src={formData.questionImageUrl}
            alt="Question"
            style={{ maxWidth: "100px", marginTop: "5px" }}
          />
        )}

        {formData.questionType !== "TRIVIA" && (
          <>
            <DynamicMathSelector
              grade={formData.grade}
              setGrade={(val) => setFormData({ ...formData, grade: val })}
              topic={formData.topic}
              setTopic={(val) => setFormData({ ...formData, topic: val })}
              topicList={formData.topicList}
              setTopicList={(val) => setFormData({ ...formData, topicList: val })}
            />
            <select
              value={formData.difficultyLevel}
              onChange={(e) => setFormData({ ...formData, difficultyLevel: e.target.value })}
            >
              <option value="">Select Difficulty</option>
              {["L1", "L2", "L3", "Br"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </>
        )}

        {formData.questionType === "MCQ" && (
          <div className="optionsSection">
            {formData.options.map((option, index) => (
              <div key={index} style={{ marginBottom: "10px" }}>
                <input
                  type="text"
                  value={option.text}
                  onChange={(e) => {
                    const newOptions = [...formData.options];
                    newOptions[index].text = e.target.value;
                    setFormData({ ...formData, options: newOptions });
                  }}
                  placeholder={`Option ${index + 1}`}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, "options", index)}
                />
                {option.image && (
                  <img
                    src={option.image}
                    alt={`Option ${index + 1}`}
                    style={{ maxWidth: "80px", marginLeft: "10px", verticalAlign: "middle" }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {formData.questionType !== "TRIVIA" && (
          <div>
            <input
              type="text"
              value={formData.correctAnswer.text}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  correctAnswer: { ...formData.correctAnswer, text: e.target.value },
                })
              }
              placeholder="Correct Answer Text"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e, "correctAnswer")}
            />
            {formData.correctAnswer.image && (
              <img
                src={formData.correctAnswer.image}
                alt="Answer"
                style={{ maxWidth: "80px", marginLeft: "10px" }}
              />
            )}
          </div>
        )}

        <button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </button>
        <button onClick={onCancel} disabled={loading}>
          Cancel
        </button>
      </div>
    );
  };

  return (
    <div className="allQuestionContainer">
      <h2>All Questions</h2>
      <hr />

      {/* Filters */}
      <div className="filterControls">
        <div className="horizontal-filters">
          <DynamicMathSelector
            grade={grade}
            setGrade={setGrade}
            topic={topic}
            setTopic={setTopic}
            topicList={topicList}
            setTopicList={setTopicList}
          />

          <div className="formGroup">
            <label htmlFor="questionTypeFilter">Question Type:</label>
            <select
              id="questionTypeFilter"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="MCQ">MCQ</option>
              <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
              <option value="TRIVIA">Trivia</option>
            </select>
          </div>

          <div className="formGroup">
            <label htmlFor="difficultyFilter">Difficulty Level:</label>
            <select
              id="difficultyFilter"
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
            >
              <option value="all">All Levels</option>
              {["L1", "L2", "L3", "Br"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Editing Mode */}
      {editingQuestion && (
        <UploadComponent
          questionData={editingQuestion}
          onSave={() => setEditingQuestion(null)}
          onCancel={() => setEditingQuestion(null)}
        ></UploadComponent>
      )}

      {/* Conditional Rendering */}
      {!isAnyFilterActive() && !hasFetched && !loading ? (
        <div className="instructionState">
          <p>🔍 Select a filter above to load and view questions.</p>
        </div>
      ) : loading ? (
        <div className="loadingState">
          <p>🔄 Loading questions, please wait...</p>
        </div>
      ) : error ? (
        <p style={{ color: "red", textAlign: "center" }}>{error}</p>
      ) : filteredQuestions.length === 0 ? (
        <p style={{ textAlign: "center", color: "#666", fontStyle: "italic" }}>
          No questions match your filters.
        </p>
      ) : (
        <>
          <div className="questionStats">
            <p>
              Showing <strong>{filteredQuestions.length}</strong> of{" "}
              <strong>{questions.length}</strong> questions
            </p>
          </div>

          <div className="questionList">
            <ol>
              {filteredQuestions.map((q) => (
                <li key={q.id} className="questionItem">
                  <div>
                    <strong>
                      {q.question
                        ? isHTML(q.question)
                          ? parse(q.question)
                          : q.question
                        : q.questionImage
                        ? "[Image Question]"
                        : "No question text"}
                    </strong>{" "}
                    ({q.type})
                  </div>
                  <small>
                    {" "}
                    - {q.timestamp ? new Date(q.timestamp).toLocaleString() : "No Time"}
                  </small>

                  {q.questionImage && (
                    <div>
                      <img
                        src={q.questionImage}
                        alt="Question"
                        style={{ maxWidth: "300px", marginTop: "10px" }}
                      />
                    </div>
                  )}

                  {q.type === "MCQ" && Array.isArray(q.options) && (
                    <ul>
                      {q.options.map((opt, idx) => (
                        <li key={idx}>
                          {opt.text}{" "}
                          {opt.image && (
                            <img
                              src={opt.image}
                              alt={`Option ${idx + 1}`}
                              style={{ maxWidth: "100px", marginLeft: "5px" }}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {q.correctAnswer && (
                    <p>
                      <strong>Correct Answer:</strong> {q.correctAnswer.text}{" "}
                      {q.correctAnswer.image && (
                        <img
                          src={q.correctAnswer.image}
                          alt="Answer"
                          style={{ maxWidth: "100px", marginLeft: "5px" }}
                        />
                      )}
                    </p>
                  )}

                  <button className="editButton" onClick={() => handleEdit(q)}>
                    Edit
                  </button>
                  <button className="deleteButton" onClick={() => handleDelete(q)}>
                    Delete
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      <ToastContainer position="bottom-right" autoClose={3000} />
    </div>
  );
};

export default AllQuestions;